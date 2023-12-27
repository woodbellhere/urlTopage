/**
 * switch状态就是不带参数
 * reconsume就是带参数
 * xxx flag就是一个boolean变量
 * 标准里说ignore就是switch到自己
 */

const EOF = Symbol("EOF");
// 读标签时的缓冲变量
let currentToken = null;
let currentAttribute = null;
let currentTextNode = null;
// 遇到开始标签入栈，结束标签出栈
// 任何元素的父元素都是它入栈前的栈顶
let stack = [{ type: "document", children: [] }];

import css from "css";
let rules = [];
function addCSSRules(text) {
  var ast = css.parse(text);
  console.log(JSON.stringify(ast, null, "..."));
  rules.push(...ast.stylesheet.rules);
}
// 也是标准规定都要emit，意思是马上交给tree construction接手
function emit(token) {
  // if (token.type === "text") {
  //   return;
  // }
  let top = stack[stack.length - 1];
  // 来start token就入栈一个element
  if (token.type === "startTag") {
    let element = {
      type: "element",
      children: [],
      attributes: [],
    };
    element.tagName = token.tagName;
    // 除了type和tagName，其他内容都push进element的属性
    for (let p in token) {
      if (p !== "type" && p !== "tagName") {
        element.attributes.push({
          name: p,
          value: token[p],
        });
      }
      // 把element加入top的children
      // 然后再把top设置element的parent，对偶操作
      // 比如说head里有style
      // body里有其他标签这种
      top.children.push(element);
      element.parent = top;
      // 如果是自封闭标签就不用推进栈了，可以当作快进快出
      if (!token.isSelfClosingStartTag) {
        stack.push(element);
      }
      // 有新标签就清空文本节点
      currentTextNode = null;
    }
    // 关闭标签的检查要直接不少
  } else if (token.type === "endTag") {
    // 如果开始和关闭标签不等，报错
    if (top.tagName !== token.tagName) {
      throw new Error("tag start end doesn't match");
      // 相等则成功配对，出栈
    } else {
      if (top.tagName === "style") {
        // 这里出于省事先避开link
        addCSSRules(top.children[0].content);
      }
      stack.pop();
    }
    // 清空文本节点
    currentTextNode = null;
  } else if (token.type === "text") {
    // 没有文本节点则新建文本节点
    if (currentTextNode === null) {
      currentTextNode = {
        type: "text",
        content: "",
      };
      top.children.push(currentTextNode);
    }
    // 有节点就追加
    currentTextNode.content += token.content;
  }
  console.log(token);
}

function data(character) {
  if (character === "&") {
    returnState = data;
    return characterReference;
  }
  // 读到标签开始则进入响应状态
  else if (character === "<") {
    return tagOpen;
    // 结束解析就完事
  } else if (character === EOF) {
    // emit({ type: "EOF" });
    return;
    // 其他都是文本节点
  } else {
    emit({ type: "text", content: character });
    return data;
  }
}

function characterReference(character) {
  if (character.match(/^[0-9a-zA-Z]$/)) {
    return namedCharacterReference;
  } else if (character === "#") {
    temporaryBuffer += character;
    return numericCharacterReference(character);
  } else {
    return returnState;
  }
}

function tagOpen(character) {
  // 在标签开始阶段读到斜杠，则说明遇到封闭标签，进入标签封闭状态
  if (character === "/") {
    return endTagOpen;
    // 如果以英文字母开头，则要么是开始标签，要么是自封闭标签，进入响应状态
  } else if (character.match(/^[a-zA-Z]$/)) {
    currentToken = {
      type: "startTag",
      tagName: "",
    };
    return tagName(character);
    // 一个reconsume逻辑
  } else {
    return;
  }
}

function endTagOpen(character) {
  // 如果字符以英文字母结尾,同样也要继续看tagName
  if (character.match(/^[a-zA-Z]$/)) {
    currentToken = {
      type: "endTag",
      tagName: "",
    };
    return tagName(character);
    // 其他状态都要报错
  } else if (character === ">") {
    return data;
  } else if (character === EOF) {
  } else {
    currentToken = {
      type: "comment",
      data: "",
    };
    return bogusComment(character);
  }
}

function tagName(character) {
  // 遇到制表，换行和换页符和空格，这是html中四种有效的空白符
  if (character.match(/^[\t\n\f ]$/)) {
    // 很好理解，标签名之后就是标签的各种属性名了
    return beforeAttributeName;
    // 遇到斜杠则说明是自封闭标签
  } else if (character === "/") {
    return selfClosingStartTag;
  } else if (character === ">") {
    emit({ currentToken });
    return data;
    // 依然在tagName状态中,标准上只要求大写字母的处理
  } else if (character.match(/^[A-Z]$/)) {
    currentToken.tagName += character.toLowerCase(); //或许要换成toLowerCase
    return tagName;
    // 读到右尖括号说明是普通开始标签，可以结束本次读取，回到data状态解析下一个
  } else if (character === null) {
    // 标准上要求拼接一个u+fffd问号字符
    currentToken.tagName += "\uFFFD";
  } else if (character === EOF) {
    emit({ type: "EOF" });
  } else {
    return tagName;
  }
}

function beforeAttributeName(character) {
  // 遇到空白符号说明还在读属性中
  if (character.match(/^[\t\n\f ]$/)) {
    return beforeAttributeName;
    // 遇到右尖括号则完成解析，返回data
  } else if (character === ">" || character === "/" || character === EOF) {
    return afterAttributeName(character);
    // 遇到等号和空白符号一样也是在读
  } else if (character === "=") {
    currentAttribute = {
      name: character,
      value: "",
    };
    return attributeName;
  } else {
    currentAttribute = {
      name: "",
      value: "",
    };
    return attributeName(character);
  }
}

function attributeName(character) {
  if (
    character.match(/^[\t\n\f ]$/) ||
    character === "/" ||
    character === ">" ||
    character === EOF
  ) {
    return afterAttributeName(character);
  } else if (character === "=") {
    return beforeAttributeValue;
  } else if (character.match(/^[A-Z]$/)) {
    currentAttribute.name += character.toLowerCase();
  } else if (character === null) {
    currentAttribute.name += "\uFFFD";
  } else if (character === '"' || character === "'" || character === "<") {
    currentAttribute.name += character;
  } else {
    currentAttribute.name += character;
  }
}

function afterAttributeName(character) {
  if (character.match(/^[\t\n\f ]$/)) {
    return afterAttributeName;
  } else if (character === "/") {
    return selfClosingStartTag;
  } else if (character === "=") {
    emit({ currentToken });
    return beforeAttributeName;
  } else if (character === ">") {
    emit({ currentToken });
    return data;
  } else if (character === EOF) {
    emit({ type: "EOF" });
  } else {
    currentAttribute = {
      name: "",
      value: "",
    };
    return attributeName(character);
  }
}

function beforeAttributeValue(character) {
  if (character.match(/^[\t\n\f ]$/)) {
    return beforeAttributeValue;
  } else if (character === '"') {
    return doubleQuotedAttributeValue;
  } else if (character === "'") {
    return singleQuotedAttributeValue;
  } else if (character === ">") {
    emit({ currentToken });
    return data;
  } else {
    return UnquotedAttributeValue(character);
  }
}

function doubleQuotedAttributeValue(character) {
  if (character === '"') {
    return quotedAfterAttributeValue;
  } else if (character === "&") {
    doubleQuotedAttributeValue = returnState;
    return characterReference;
  } else if (character === null) {
    currentAttribute.value += "\uFFFD";
  } else if (character === EOF) {
    emit({ type: "EOF" });
  } else {
    currentAttribute.value += character;
  }
}

function singleQuotedAttributeValue(character) {
  if (character === "'") {
    return quotedAfterAttributeValue;
  } else if (character === "&") {
    singleQuotedAttributeValue = returnState;
    return characterReference;
  } else if (character === null) {
    currentAttribute.name += "\uFFFD";
  } else if (character === EOF) {
    emit({ type: "EOF" });
  } else {
    currentAttribute.value += character;
  }
}

function UnquotedAttributeValue(character) {
  if (character.match(/^[\t\n\f ]$/)) {
    return beforeAttributeName;
  } else if (character === "&") {
    UnquotedAttributeValue = returnState;
    return characterReference;
  } else if (character === ">") {
    emit({ currentToken });
    return data;
  } else if (character === null) {
    currentAttribute.name += "\uFFFD";
  } else if (
    character === '"' ||
    character === "'" ||
    character === "<" ||
    character === "=" ||
    character === "`"
  ) {
    currentAttribute.value += character;
  } else if (character === EOF) {
    emit({ type: "EOF" });
  } else {
    currentAttribute.value += character;
  }
}

function quotedAfterAttributeValue(character) {
  if (character.match(/^[\t\n\f ]$/)) {
    return beforeAttributeName;
  } else if (character === "/") {
    return selfClosingStartTag;
  } else if (character === ">") {
    emit({ currentToken });
    return data;
  } else if (character === EOF) {
    emit({ type: "EOF" });
  } else {
    return beforeAttributeName(character);
  }
}

function selfClosingStartTag(character) {
  if (character === ">") {
    currentToken.isSelfClosingStartTag = true;
    emit({ currentToken });
    return data;
  } else if (character === "EOF") {
    emit({ type: "EOF" });
  } else {
    return beforeAttributeName(character);
  }
}

// 由于调用关系，首先进入这个函数
export function parseHTML(html) {
  // 接受html文本，返回一颗DOM树
  // 标准里初始状态就叫data，首先进入data状态
  let state = data;
  for (let character of html) {
    state = state(character);
  }
  // 结束字符不能是任何有效字符，一个symbol就能有效地结束解析
  state = state(EOF);
}
