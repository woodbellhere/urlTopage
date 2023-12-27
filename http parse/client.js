import net from "node:net";
import { resolve } from "node:path";
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
      // 直接序列化内容
      this.bodyText = JSON.stringify(this.body);
    } else if (
      // 表单格式的前身，kv以=分割，多个kv以&分割
      this.headers["Content-Type"] === "application/x-www-form-urlencoded"
    ) {
      // 把body内的数据拼接为常见的url查询字符串格式
      this.bodyText = Object.keys(this.body)
        .map((key) => `${key}=${encodeURIComponent(this.body[key])}`)
        .join("&");
    }
    // 获取body长度
    this.headers["Content-Length"] = this.bodyText.length;
  }

  send(connection) {
    // 在request构造器中收集必要信息
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
    // 如果处于等待接收状态行阶段，如果遇到回车（本行）则切换状态到等待状态行结束。不然则将读取的内容正常拼接进状态行中
    if (this.current === this.WAITING_STATUS_LINE) {
      if (char === "\r") {
        this.current = this.WAITING_STATUS_LINE_END;
      } else {
        this.statusLine += char;
      }
      // 如果在等待状态行结束阶段，又遇到换行符，则说明彻底读完状态行，进入等待报文头部状态
    } else if (this.current === this.WAITING_STATUS_LINE_END) {
      if (char === "\n") {
        this.current = this.WAITING_HEADER_NAME;
      }
      // 在等待报文头部阶段，如果遇到连接kv的:符号，则说明读到http报文头部属性名了，改变状态为等待头部空格
      // 如果遇到回车符，则说明整个头部block结束了，状态改为等待头部block结束，不过这里还需要考虑编码问题。
      // 如果前面的编码方法为chunked，就需要在bodyparser变量中初始化一个新的解析器trunkedbodyparser
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
      // 如果在等待头部空格阶段，又读到空字符，说明正式进入等待头部值状态
    } else if (this.current === this.WAITING_HEADER_SPACE) {
      if (char === " ") {
        this.current = this.WAITING_HEADER_VALUE;
      }
      // 如果在等待状态值阶段，读到回车符说明本条头部结束，状态更改为等待头部行结束
      // 同时将读取到的头部值设置到解析器的头部变量中
      // 然后置空头部名和头部值，等待后续传入新头部
    } else if (this.current === this.WAITING_HEADER_VALUE) {
      if (char === "\r") {
        this.current = this.WAITING_HEADER_LINE_END;
        this.headers[this.headerName] = this.headerValue;
        this.headerName = "";
        this.headerValue = "";
        // 如果没读到回车符，你就乖乖往头部值里拼接
      } else {
        this.headerValue += char;
      }
      // 如果在等待头部行结束阶段，如果读到换行符，则说明又要重读新行，则转为等待头部值阶段
    } else if (this.current === this.WAITING_HEADER_LINE_END) {
      if (char === "\n") {
        this.current = this.WAITING_HEADER_NAME;
      }
      //如果在等待头部block结束阶段，读到换行符，则说明应该读报文body部分
    } else if (this.current === this.WAITING_HEADER_BLOCK_END) {
      if (char === "\n") {
        this.current = this.WAITING_BODY;
      }
      // 在等待报文body阶段，则可以将读取的内容交给内部的bodyparser调用receiveChar处理
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
