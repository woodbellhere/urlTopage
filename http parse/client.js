const net = require("node:net");
const { resolve } = require("node:path");
import { parseHTML } from "../html parse/parser";

class Request {
  constructor(options) {
    this.method = options.method || "GET";
    this.host = options.host;
    this.port = options.port || 80;
    this.path = options.body || "/";
    this.body = options.body || {};
    this.headers = options.headers || {};
    // http中的content-type是必须的
    if (!this.headers["Content-Type"]) {
      this.headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    // body是kv格式
    // content-type的不同影响body格式
    // 常见（4-5种中的）2种内容格式的编码方式
    if (this.headers["Content-Type"] === "application/json") {
      this.bodyText = JSON.stringify(this.body);
    } else if (
      // 表单格式的前身，kv以=分割，多个kv以&分割
      this.headers["Content-Type"] === "application/x-www-form-urlencoded"
    ) {
      this.bodyText = Object.keys(this.body)
        .map((key) => `${key} = ${encodeURIComponent(this.body[key])}`)
        .join("&");
    }

    this.headers["Content-Length"] = this.bodyText.length;
  }

  send(connection) {
    // 在request构造器种收集必要信息
    // 设计send函数把请求发到服务器
    // send函数需要是异步的，所以应该返回promise

    // 判断连接情况决定是否需要自建连接
    return new Promise((resolve, reject) => {
      const parser = new ResponseParse();
      if (connection) {
        connection.write(this.toString());
      } else {
        connection = net.createConnection(
          {
            host: this.host,
            port: this.port,
          },
          () => {
            connection.write(this.toString());
          }
        );
      }
      // 收到数据就传给parse
      // 并且根据parse状态resolve promise
      connection.on("data", (data) => {
        console.log(data.toString());
        parser.receive(data.toString());
        if (parser.isFinished) {
          resolve(parser.response);
          connection.end();
        }
      });
      connection.on("error", (err) => {
        reject(err);
        connection.end();
      });
    });
  }

  toString() {
    return `${this.method} ${this.path} HTTP/1.1\r
    ${Object.keys(this.headers)
      .map((key) => `${key}: ${this.headers[key]}`)
      // 每个header一行
      .join("\r\n")}\r
    \r
    ${this.bodyText}`;
  }
}

class ResponseParse {
  constructor() {
    this.WAITING_STATUS_LINE = 0;
    this.WAITING_STATUS_LINE_END = 1;
    this.WAITING_HEADER_NAME = 2;
    this.WAITING_HEADER_SPACE = 3;
    this.WAITING_HEADER_VALUE = 4;
    this.WAITING_HEADER_LINE_END = 5;
    this.WAITING_HEADER_BLOCK_END = 6;
    this.WAITING_BODY = 7;

    this.current = this.WAITING_STATUS_LINE;
    this.statusLine = "";
    this.headers = {};
    this.headerName = "";
    this.headerValue = "";
    this.bodyParser = null;
  }

  get isFinished() {
    return this.bodyParser && this.bodyParser.isFinished;
  }

  get response() {
    this.statusLine.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/);
    return {
      statusCode: RegExp.$1,
      statusText: RegExp.$2,
      headers: this.headers,
      body: this.bodyParser.content.join(""),
    };
  }

  receive(string) {
    for (let i = 0; i < string.length; i++) {
      this.receiveChar(string.charAt(i));
    }
  }
  receiveChar(char) {
    if (this.current === this.WAITING_STATUS_LINE) {
      if (char === "\r") {
        this.current = this.WAITING_STATUS_LINE_END;
      } else {
        this.statusLine += char;
      }
    } else if (this.current === this.WAITING_STATUS_LINE_END) {
      if (char === "\n") {
        this.current = this.WAITING_HEADER_NAME;
      }
    } else if (this.current === this.WAITING_HEADER_NAME) {
      if (char === ":") {
        this.current = this.WAITING_HEADER_SPACE;
      } else if (char === "\r") {
        this.current = this.WAITING_HEADER_BLOCK_END;
        // 此处可以有数个transfer-encoding值，可以适当多写几个if else
        if (this.headers["Transfer-Encoding"] === "chunked") {
          this.bodyParser = new TrunkedBodyParser();
        }
      }
    } else if (this.current === this.WAITING_HEADER_SPACE) {
      if (char === " ") {
        this.current = this.WAITING_HEADER_VALUE;
      }
    } else if (this.current === this.WAITING_HEADER_VALUE) {
      if (char === "\r") {
        this.current = this.WAITING_HEADER_LINE_END;
        this.headers[this.headerName] = this.headerValue;
        this.headerName = "";
        this.headerValue = "";
      } else {
        this.headerValue += char;
      }
    } else if (this.current === this.WAITING_HEADER_LINE_END) {
      if (char === "\n") {
        this.current = this.WAITING_HEADER_NAME;
      }
    } else if (this.current === this.WAITING_HEADER_BLOCK_END) {
      if (char === "\n") {
        this.current = this.WAITING_BODY;
      }
    } else if (this.current === this.WAITING_BODY) {
      this.bodyParser.receiveChar(char);
    }
  }
}

// 由于响应body的content-type种类很多，所以使用不同子parser来处理解析问题
// trunked就是一种这样的子parser
class TrunkedBodyParser {
  constructor() {
    this.WAITING_LENGTH = 0;
    this.WAITING_LENGTH_LINE_END = 1;
    this.READING_TRUNK = 2;
    this.WAITING_NEW_LINE = 3;
    this.WAITING_NEW_LINE_END = 4;
    this.length = 0;
    this.content = [];
    this.isFinished = false;
    this.current = this.WAITING_LENGTH;
  }

  receiveChar(char) {
    if ((this.current = this.WAITING_LENGTH)) {
      if (char === "\r") {
        if (this.length === 0) {
          this.isFinished = true;
        }
        this.current = this.WAITING_LENGTH_LINE_END;
      } else {
        this.length *= 16;
        this.length += parseInt(char, 16);
      }
    } else if (this.current === this.WAITING_LENGTH_LINE_END) {
      if (char === "\n") {
        this.current = this.READING_TRUNK;
      }
    } else if (this.current === this.READING_TRUNK) {
      this.content.push(char);
      this.length--;
      if (this.length === 0) {
        this.current = this.WAITING_NEW_LINE;
      }
    } else if (this.current === this.WAITING_NEW_LINE) {
      if (char === "\r") {
        this.current = this.WAITING_LENGTH_LINE_END;
      }
    } else if (this.current === this.WAITING_NEW_LINE_END) {
      if (char === "\n") {
        this.current = this.WAITING_LENGTH;
      }
    }
  }
}

// 调api的引子
void async function () {
  let req = new Request({
    method: "POST",
    host: "127.0.0.1",
    port: "8080",
    path: "/",
    headers: {
      ["X-Foo2"]: "customed",
    },
    body: {
      name: "woodbell",
    },
  });

  let res = await req.send();
  console.log(res);
  // 实际的浏览器处理中会分段异步处理body
  let dom = parseHTML(res.body);
};
