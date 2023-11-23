const EOF = Symbol("EOF");
function data(token) {
  if (token === "<") {
    return tagOpen;
  } else if (token === EOF) {
    return;
  } else {
    return data;
  }
}

function tagOpen(token) {
  if (token === "/") {
    return endTagOpen;
  } else if (token.match(/^[a-zA-Z]$/)) {
    return tagName(token);
  } else {
    return;
  }
}

export function parseHTML(html) {
  // 接受html文本，返回一颗DOM树
  // console.log(html);
  let state = data;
  for (let token of html) {
    state = state(token);
  }
  // 结束字符不能是任何有效字符
  state = state(EOF);
}
