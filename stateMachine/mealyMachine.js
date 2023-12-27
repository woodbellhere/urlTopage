// function matchA() {
//   for (let str of string) {
//     if (str === "a") return str;
//   }
// string.forEach((str) => {
//   if (str === "a") return str;
// });

// string.split("").find((str) => str === "a");
// }

function matchAB() {
  for (let i = 0; i < string.length; i++) {
    if (string.charAt(i) === "a" && string.charAt(i + 1) === "b") return;
  }
}

function matchAB2() {
  let foundA = false;
  for (let c of string) {
    if (c === "a") {
      foundA = true;
    } else if (foundA && c === "b") {
      return true;
    } else {
      foundA = false;
    }
  }
  return false;
}

// 非状态机版本
function matchABCDE() {
  let foundA = false;
  let foundB = false;
  let foundC = false;
  let foundD = false;
  let foundE = false;

  for (let str of string) {
    if (str === "a") {
      foundA = true;
    } else if (foundA && str === "b") {
      foundB = true;
    } else if (foundB && str === "c") {
      foundC = true;
    } else if (foundC && str === "d") {
      foundD = true;
    } else if (foundD && str === "e") {
      foundE = true;
    } else if (foundE && str === "f") {
      return true;
    } else {
      foundA = false;
      foundB = false;
      foundC = false;
      foundD = false;
      foundE = false;
    }
  }
  return false;
}

// 状态机版本
function match(string) {
  let state = start;
  for (let str of string) {
    state = state(str);
  }
  return state === end;
}

function start(str) {
  if (str === "a") {
    return foundA;
  } else {
    return start;
  }
}

function end(str) {
  return end;
}

function foundA(str) {
  if (str === "b") {
    return foundB;
  } else {
    // 避免循环导致的错漏
    return start(str);
  }
}
function foundB(str) {
  if (str === "c") {
    return foundC;
  } else {
    return start(str);
  }
}
function foundC(str) {
  if (str === "d") {
    return foundD;
  } else {
    return start(str);
  }
}
function foundD(str) {
  if (str === "e") {
    return foundE;
  } else {
    return start(str);
  }
}
function foundE(str) {
  if (str === "f") {
    return end;
  } else {
    return start(str);
  }
}

match("abcedf");

//  状态机 abcaby
// start end foundA foundB 都不变
function foundC(str) {
  if (str === "a") {
    return foundA2;
  } else {
    return start(str);
  }
}

function foundA2(str) {
  if (str === "b") {
    return foundB2;
  } else {
    return start(str);
  }
}

function foundB2(str) {
  if (str === "x") {
    return end;
  } else {
    return foundB(str);
  }
}

// abababx的状态机
