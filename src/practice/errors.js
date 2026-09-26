// Friendly Korean explanations for Python errors. The original error line is
// always kept next to the explanation, so nothing is hidden from the learner.
// Code names go after a colon (": `name`.") so no Korean particle has to
// agree with an English name.

const PY_WORDS = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '),
);

function leftOfAssign(text) {
  const match = /^([^=]*?)=(?!=)/.exec(text || '');
  return match ? match[1] : null;
}

function syntaxBody(error) {
  const message = error.message || '';
  const text = error.text || '';
  const left = leftOfAssign(text);
  if (/leading zeros/.test(message)) {
    return '숫자는 0으로 시작할 수 없어요. 앞의 0을 지워 보세요.';
  }
  if (/invalid decimal literal|invalid digit|invalid hexadecimal|invalid octal|invalid binary/.test(message)) {
    return '이름은 숫자로 시작할 수 없어요. 글자나 밑줄(_)로 시작하고, 숫자는 이름의 가운데나 끝에 써요.';
  }
  if (/cannot assign to expression/.test(message)) {
    if (left && /[A-Za-z_가-힣]\s*-\s*[A-Za-z_가-힣]/.test(left)) {
      return '이름에는 글자, 숫자, 밑줄(_)만 쓸 수 있어요. 빼기 기호(-)가 들어가면 파이썬은 = 왼쪽을 계산식으로 읽어요. 두 단어는 밑줄로 이어요.';
    }
    return '= 왼쪽에는 이름 하나만 올 수 있어요. 계산은 = 오른쪽에서 해요.';
  }
  if (/cannot assign to literal/.test(message)) {
    return '= 왼쪽에는 값이 아니라 이름이 와야 해요. 이름을 왼쪽에, 값을 오른쪽에 써요.';
  }
  if (/cannot assign to function call/.test(message)) {
    return '= 왼쪽에는 이름이 와야 해요. 괄호를 붙인 함수 호출에는 값을 담을 수 없어요.';
  }
  if (/cannot assign to (True|False|None|keyword)/.test(message)) {
    return '파이썬이 따로 쓰는 낱말에는 값을 담을 수 없어요. 다른 이름을 지어 보세요.';
  }
  const odd = /invalid character '(.+?)'/.exec(message);
  if (odd) {
    return `파이썬이 모르는 문자가 섞여 있어요: \`${odd[1]}\`. 한글 입력 상태에서 친 괄호나 따옴표일 수 있어요. 영문 입력으로 바꿔 다시 써 보세요.`;
  }
  if (/unterminated (triple-quoted )?string literal|EOL while scanning|EOF while scanning/.test(message)) {
    return '따옴표로 연 글자가 닫히지 않았어요. 여는 따옴표와 같은 따옴표로 닫아 주세요.';
  }
  if (/was never closed/.test(message)) {
    return '여는 괄호가 닫히지 않았어요. 괄호의 짝을 맞춰 보세요.';
  }
  if (/unmatched '/.test(message) || /does not match opening parenthesis/.test(message)) {
    return '괄호의 짝이 맞지 않아요. 여는 괄호와 닫는 괄호를 하나씩 짝지어 보세요.';
  }
  if (/Missing parentheses in call to 'print'/.test(message)) {
    return 'print 뒤에는 괄호가 필요해요. print(값)처럼 괄호 안에 보여 줄 값을 써요.';
  }
  if (/expected ':'/.test(message)) {
    return '이 줄 끝에 콜론(:)이 빠졌어요.';
  }
  if (/unexpected indent/.test(message)) {
    return '줄 앞에 필요 없는 빈칸이 있어요. 이 줄의 시작을 윗줄과 맞춰 보세요.';
  }
  if (/expected an indented block/.test(message)) {
    return '이 줄 다음에는 안쪽으로 들여 쓴 줄이 와야 해요.';
  }
  if (/unindent does not match/.test(message)) {
    return '들여쓰기 칸 수가 위의 줄들과 맞지 않아요.';
  }
  if (error.type === 'TabError' || /inconsistent use of tabs/.test(message)) {
    return '들여쓰기에 탭과 빈칸이 섞여 있어요. 빈칸 4개로 맞춰 주세요.';
  }
  if (/Perhaps you forgot a comma/.test(message)) {
    return '값과 값 사이에 쉼표(,)가 빠진 것 같아요.';
  }
  if (left !== null) {
    const words = left.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1 && PY_WORDS.has(words[0])) {
      return `파이썬이 따로 쓰는 낱말은 이름으로 쓸 수 없어요: \`${words[0]}\`. 다른 이름을 지어 보세요.`;
    }
    if (words.length > 1 && words.every((word) => /^[A-Za-z_가-힣][\w가-힣]*$/.test(word))) {
      return '이름에는 빈칸을 쓸 수 없어요. 두 단어는 밑줄(_)로 이어요.';
    }
  }
  if (/Maybe you meant '==' or ':=' instead of '='/.test(message)) {
    return '이 자리에는 =를 쓸 수 없어요. 값이 같은지 비교하려면 ==를 써요.';
  }
  return '파이썬 문법에 맞지 않는 곳이 있어요. 표시된 줄에 기호가 빠졌거나 남지 않았는지 살펴보세요.';
}

function nameErrorBody(error) {
  const name = error.name || (/name '(.+?)' is not defined/.exec(error.message || '') || [])[1];
  if (!name) return '파이썬이 모르는 이름이 나왔어요. 철자가 맞는지 확인해 보세요.';
  const head = `파이썬이 모르는 이름이 나왔어요: \`${name}\`.`;
  const suggestion = error.suggestion;
  if (suggestion && suggestion.toLowerCase() === name.toLowerCase()) {
    return `${head} 대문자와 소문자만 다른 이름이 위에 있어요: \`${suggestion}\`. 파이썬은 대문자와 소문자를 다른 글자로 봐요.`;
  }
  if (suggestion) {
    return `${head} 철자가 비슷한 이름이 있어요: \`${suggestion}\`. 같은 이름을 쓰려던 건지 확인해 보세요.`;
  }
  if (/[^\x00-\x7F]/.test(name)) {
    return `${head} 글자를 그대로 보여 주려면 따옴표로 감싸요. 예를 들면 print("${name}")처럼요.`;
  }
  return `${head} 값을 담기 전에 먼저 쓰지 않았는지, 철자가 맞는지 확인해 보세요.`;
}

function runtimeBody(error) {
  const { type, message = '' } = error;
  switch (type) {
    case 'NameError':
    case 'UnboundLocalError':
      return nameErrorBody(error);
    case 'TypeError':
      if (/can only concatenate str|unsupported operand type\(s\) for [+\-]: '(int|float)' and 'str'|'str' and '(int|float)'/.test(message)) {
        return '숫자와 글자(문자열)는 바로 더하거나 뺄 수 없어요. 둘 중 한 종류로 맞춰 주세요.';
      }
      if (/can't multiply sequence by non-int/.test(message)) {
        return '글자(문자열)에는 정수만 곱할 수 있어요.';
      }
      if (/object is not callable/.test(message)) {
        return '괄호를 붙여 부를 수 없는 값이에요. print 같은 함수 이름을 변수 이름으로 쓰지 않았는지 확인해 보세요.';
      }
      if (/positional argument|required argument|takes no arguments/.test(message)) {
        return '함수에 넘긴 값의 개수가 맞지 않아요.';
      }
      return '값의 종류가 맞지 않는 계산이 있어요. 숫자와 글자를 섞어 쓰지 않았는지 확인해 보세요.';
    case 'ZeroDivisionError':
      return '0으로 나눌 수 없어요. 나누는 수를 확인해 보세요.';
    case 'ValueError':
      if (/invalid literal for int/.test(message)) return 'int()에는 숫자 모양의 글자만 넣을 수 있어요.';
      return '값의 모양이 맞지 않아요.';
    case 'AttributeError':
      return '그 값에는 그런 기능이 없어요. 점(.) 뒤의 이름을 확인해 보세요.';
    case 'IndexError':
      return '목록에 없는 자리를 꺼내려고 했어요.';
    case 'KeyError':
      return '사전에 없는 키를 찾았어요.';
    case 'InputNotAvailable':
      return '이 실습 화면에서는 input()으로 값을 받을 수 없어요. 값을 코드에 직접 적어 주세요.';
    case 'RecursionError':
      return '함수가 자기 자신을 너무 많이 불렀어요.';
    case 'OverflowError':
    case 'MemoryError':
      return '값이 너무 커서 계산할 수 없어요.';
    case 'ModuleNotFoundError':
    case 'ImportError':
      return '이 실습에서는 그 모듈을 쓸 수 없어요.';
    case 'AssertionError':
      return 'assert로 확인한 조건이 맞지 않았어요.';
    case 'InternalError':
      return '실행 도구에 문제가 생겼어요. 한 번 더 실행해 보세요.';
    default:
      return '실행하다가 오류가 났어요. 아래 원래 메시지를 참고해 보세요.';
  }
}

/**
 * error: the harness error object ({ kind, type, message, summary, line, text, name?, suggestion? }).
 * Returns { title, body, original, line, code } or null.
 */
export function explainError(error) {
  if (!error) return null;
  const line = Number.isInteger(error.line) ? error.line : null;
  const syntax = error.kind === 'syntax';
  const where = line === 1 ? '첫 번째 줄' : `${line}번째 줄`;
  const title = syntax
    ? line
      ? `${where}을 파이썬이 읽지 못했어요`
      : '파이썬이 코드를 읽지 못했어요'
    : line
      ? `${where}에서 멈췄어요`
      : '실행하다가 멈췄어요';
  return {
    title,
    body: syntax ? syntaxBody(error) : runtimeBody(error),
    original: error.summary || `${error.type}: ${error.message}`,
    line,
    code: typeof error.text === 'string' ? error.text : null,
  };
}

export function explainTimeout(ms) {
  const seconds = Math.round(ms / 1000);
  return {
    title: `${seconds}초가 지나도 끝나지 않아 멈췄어요`,
    body: '끝나지 않고 계속 도는 코드가 있는지 확인해 보세요. 파이썬은 다시 준비해 둘게요.',
    original: null,
    line: null,
    code: null,
  };
}
