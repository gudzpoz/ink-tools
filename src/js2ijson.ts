import {
  BinaryOperator,
  BlockStatement, Expression, FunctionDeclaration,
  Identifier, Literal, LogicalOperator,
  Pattern,
  PrivateIdentifier,
  SpreadElement, Statement, Super, parse as parseJs,
} from 'acorn';
import { InkBuildingBlockExpr, InkFuncType, InkRootNode } from './types';
import {
  Type_buildingBlockWithParams, Type_conditionThen, Type_cycleNode, Type_funcWithParams,
  Type_get, Type_sequenceNode, Type_set,
  Type_somethingWithParams,
} from './auto-types';

const BINARY_OPERATOR_MAP: Partial<Record<BinaryOperator | LogicalOperator, InkFuncType>> = {
  '+': 'Add',
  '&&': 'And',
  '/': 'Divide',
  '===': 'Equals',
  '>': 'GreaterThan',
  '>=': 'GreaterThanOrEqualTo',
  '<': 'LessThan',
  '<=': 'LessThanOrEqualTo',
  '%': 'Mod',
  '*': 'Multiply',
  '!==': 'NotEquals',
  '||': 'Or',
  '-': 'Subtract',
};

const UNARY_OPERATOR_SET: Set<InkFuncType> = new Set([
  'FlagIsSet',
  'FlagIsNotSet',
]);

const CYCLE_FLAG_MAP: Record<string, keyof (Type_cycleNode & Type_sequenceNode)> = {
  '': 'sequence',
  '&': 'cycle',
};

export class InkyJsCompiler {
  private params: Record<string, string>;

  constructor() {
    this.params = {};
  }

  compile(code: string): InkRootNode['buildingBlocks'] {
    const program = parseJs(code, { ecmaVersion: 2020 });
    const { body } = program;
    if (body.some((n) => n.type !== 'FunctionDeclaration')) {
      throw new Error('Expecting function declarations');
    }
    this.params = {};
    const results: InkRootNode['buildingBlocks'] = {};
    body.forEach((node) => {
      Object.entries(this.compileFunction(node as FunctionDeclaration))
        .forEach(([name, value]) => {
          results[name] = value;
        });
    });
    return results;
  }

  compileFunction(node: FunctionDeclaration): InkRootNode['buildingBlocks'] {
    const { name } = node.id;
    this.params = Object.fromEntries(node.params.map(
      (p, i) => [this.requireIdentifier(p).name, `__bb${name}${i}`],
    ));
    return {
      [name]: this.compileBlock(node.body),
    };
  }

  requireBlockStatement(statement: Statement): BlockStatement {
    if (statement.type !== 'BlockStatement') {
      throw new Error(`Expecting a block statement, got ${statement.type}`);
    }
    return statement;
  }

  compileBlock(node: BlockStatement): InkBuildingBlockExpr[] {
    return node.body.map((statement): InkBuildingBlockExpr => {
      switch (statement.type) {
        case 'IfStatement':
          return {
            condition: this.compileExpression(statement.test) as Type_buildingBlockWithParams,
            then: this.compileBlock(this.requireBlockStatement(statement.consequent)),
            otherwise: statement.alternate
              ? this.compileBlock(this.requireBlockStatement(statement.alternate))
              : undefined,
          };
        case 'ExpressionStatement': {
          const { expression } = statement;
          switch (expression.type) {
            case 'CallExpression': {
              const { callee } = expression;
              const { name } = this.requireIdentifier(callee);
              if (name === '_') {
                if (expression.arguments.length === 0) {
                  throw new Error(`Expecting more than one argument to _(): ${
                    expression.arguments.join(', ')
                  }`);
                }
                if (expression.arguments.length > 1) {
                  const flag = expression.arguments[0];
                  if (flag.type !== 'Literal' || typeof flag.value !== 'string'
                    || CYCLE_FLAG_MAP[flag.value] === undefined) {
                    throw new Error(`Expecting the first argument to _() to be a string literal with value "": ${
                      JSON.stringify(flag)
                    }`);
                  }
                  return {
                    [CYCLE_FLAG_MAP[flag.value]]: expression.arguments.slice(1).map(
                      (expr) => [this.requireLiteral(expr) as string],
                    ),
                  } as Type_sequenceNode | Type_cycleNode;
                }
                return this.requireLiteral(expression.arguments[0]) as string;
              }
              return this.compileExpression(expression) as Type_buildingBlockWithParams;
            }
            case 'AssignmentExpression': {
              const identifier = this.requireIdentifier(expression.left);
              return {
                doFuncs: [{
                  set: [
                    (this.compileExpression(identifier) as { get: Type_get }).get,
                    this.compileExpression(expression.right) as Type_somethingWithParams,
                  ],
                }],
              };
            }
            default:
              throw new Error(`Unsupported expression type: ${expression.type}`);
          }
        }
        case 'SwitchStatement': {
          const { discriminant, cases } = statement;
          let lastResult: Type_conditionThen | null = null;
          for (let i = cases.length - 1; i >= 0; i -= 1) {
            const { test, consequent } = cases[i];
            if (!test) {
              throw new Error('Unsupported default case');
            }
            if (consequent[consequent.length - 1].type !== 'BreakStatement') {
              throw new Error('Unsupported non-breaking switch case');
            }
            lastResult = {
              condition: this.compileExpression({
                type: 'BinaryExpression',
                operator: '===',
                left: discriminant,
                right: test,
                start: 0,
                end: 0,
              }) as Type_funcWithParams,
              then: this.compileBlock({
                type: 'BlockStatement',
                body: consequent.slice(0, -1),
                start: 0,
                end: 0,
              }),
              otherwise: lastResult ? [lastResult] : undefined,
            };
          }
          if (lastResult === null) {
            throw new Error('Unsupported empty switch statement');
          }
          return lastResult;
        }
        default:
          throw new Error(`Unsupported statement type: ${statement.type}`);
      }
    });
  }

  requireIdentifier(expr: Expression | Super | Pattern): Identifier {
    if (expr.type !== 'Identifier') {
      throw new Error(`Expecting an identifier, got ${expr.type}`);
    }
    return expr;
  }

  requireExpression(expr: Expression | SpreadElement | PrivateIdentifier): Expression {
    if (expr.type === 'SpreadElement' || expr.type === 'PrivateIdentifier') {
      throw new Error(`Expecting an expression statement, got ${expr.type}`);
    }
    return expr;
  }

  requireLiteral(expr: Literal | Expression | SpreadElement) {
    if (expr.type !== 'Literal') {
      throw new Error(`Expecting a literal, got ${JSON.stringify(expr)}`);
    }
    const { value } = expr;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`Expecting a literal, got ${typeof value}`);
    }
    return value;
  }

  compileExpression(node: Expression): Type_set[number] {
    switch (node.type) {
      case 'CallExpression': {
        const { name } = this.requireIdentifier(node.callee);
        if (UNARY_OPERATOR_SET.has(name as InkFuncType)) {
          return {
            func: name,
            params: [(this.compileExpression(
              this.requireIdentifier(node.arguments[0] as Expression),
            ) as { get: Type_get }).get],
          };
        }
        return {
          buildingBlock: name,
          params: Object.fromEntries(node.arguments.map((arg, i) => [
            `__bb${name}${i}`,
            this.compileExpression(this.requireExpression(arg)),
          ])),
        };
      }
      case 'Literal':
        return this.requireLiteral(node);
      case 'LogicalExpression':
      case 'BinaryExpression': {
        const { left, right, operator } = node;
        const funcType = BINARY_OPERATOR_MAP[operator];
        if (!funcType) {
          throw new Error(`Unsupported operator: ${operator}`);
        }
        return {
          func: funcType,
          params: [
            this.compileExpression(this.requireExpression(left)),
            this.compileExpression(this.requireExpression(right)),
          ],
        };
      }
      case 'UnaryExpression': {
        const { argument } = node;
        const literal = this.requireLiteral(argument);
        return -(literal as number);
      }
      case 'Identifier': {
        const { name } = node;
        if (name.startsWith('$')) {
          return {
            get: this.compileExpression({
              ...node,
              name: name.slice(1),
            }) as { get: Type_get },
          };
        }
        return {
          get: this.params[name] ? this.params[name] : name,
        };
      }
      default:
        throw new Error(`Unsupported expression type: ${node.type}: ${JSON.stringify(node)}`);
    }
  }
}

export const NEW_BUILDING_BLOCK_DEFINITIONS = `
// 群里已经讨论出不需要改语序也挺好的翻译了，这里暂时保留覆盖的代码，但应该可以删掉。
function _report_tension(p1) {
  if (fully_initalised(tension) && FlagIsNotSet(withoutfogg)) {
    scratch = (
      (upness(tension) - upness(last_tension))
      - (downness(tension) - downness(last_tension))
    );
    if (scratch !== 0) {
      if (p1 === true) {
        _('<t>');
      }
      _('', 'Your relationship with Fogg has', 'Relations with Fogg have');
      _(' ');
      if (scratch > 0) {
        if (up(last_tension)) {
          _('grown ');
          quantifier(p1, scratch);
          _(' worse');
        } else {
          _('deteriorated ');
          quantifier(p1, scratch);
        }
      } else {
        if (down(last_tension)) {
          _('strengthened');
        } else {
          _('improved');
        }
        quantifier(p1, -1 * scratch);
      }
      if (p1 === true) {
        _('.</t>');
      }
    }
  }
  last_tension = tension;
}

// value_for_index 显示扑克牌的面值，0 到 12 分别是从最小的 2 到最大的 A。
// 第二个参数是原来英文里用到的复数，翻译后不需要但是还是保留着以防出 bug。
function value_for_index(p1, p2) {
  if (p1 === 12) {
    _('A');
  } else {
    if (p1 === 11) {
      _('K');
    } else {
      if (p1 === 10) {
        _('Q');
      } else {
        if (p1 === 9) {
          _('J');
        } else {
          // 需要使用 _print_num 来避免出现“方块两”的情况
          _print_num(p1 + 2);
        }
      }
    }
  }
}

// 显示扑克牌，原来是 <面值> of <花色>，译成中文需要变换语序 <花色><面值>。
function say_card(p) {
  suit(p);
  say_value(p);
}

// 显示两张扑克牌。
// 英文里会有各种特殊情况，但中文似乎就是一对红桃五黑桃五、黑桃五和黑桃六就可以了，
// 似乎不需要合并面值或是花色。（另外下面的第一个 else 分支里应该可以再简化一下。）
// 然后可能需要讨论一下中文里是不是说“一对五”会更多一些，可以直接把花色省略掉或者括号标出来？
function say_hand_of_two(p1, p2, p3) {
  if (card_value(p1) === card_value(p2)) {
    _('一对');
    suit(p1);
    say_plural_value(p1);
    suit(p2);
    say_plural_value(p1);
  } else {
    if (suit_value(p1) === suit_value(p2)) {
      if (card_value(p1) <= card_value(p2)) {
        suit(p1);
        say_value(p1);
        _('和');
        suit(p2);
        say_value(p2);
      } else {
        suit(p2);
        say_value(p2);
        _('和');
        suit(p1);
        say_value(p1);
      }
    } else {
      if (p1 < p2) {
        say_card(p1);
        _('和');
        say_card(p2);
      } else {
        say_card(p2);
        _('和');
        say_card(p1);
      }
    }
  }
}

// say_hand 似乎没有什么没法翻译的内容，同样这里暂时保留覆盖的代码，但应该可以删掉。
function _say_hand(p1, p2, p3, p4) {
  if (p2 === -1) {
    say_card(p1);
  } else {
    if (p3 === -1) {
      say_hand_of_two(p1, p2, p4);
    } else {
      if ((card_value(p1) === card_value(p2)) && (card_value(p2) === card_value(p3))) {
        say_three_cards_same_value(p1, p2, p3, p4);
      } else {
        if ((suit_value(p1) === suit_value(p2)) && (suit_value(p2) === suit_value(p3))) {
          say_three_cards_same_suits(p1, p2, p3, p4);
        } else {
          if ((card_value(p1) === card_value(p2)) || (suit_value(p1) === suit_value(p2))) {
            say_two_cards_and_one(p1, p2, p3, p4);
          } else {
            if ((card_value(p1) === card_value(p3)) || (suit_value(p1) === suit_value(p3))) {
              say_two_cards_and_one(p1, p3, p2, p4);
            } else {
              if ((card_value(p3) === card_value(p2)) || (suit_value(p3) === suit_value(p2))) {
                say_two_cards_and_one(p3, p2, p1, p4);
              } else {
                if ((p1 < p3) && (p1 < p2)) {
                  say_card(p1);
                  _(', ');
                  say_hand_of_two(p3, p2, p4);
                } else {
                  if ((p3 < p1) && (p3 < p2)) {
                    say_card(p3);
                    _(', ');
                    say_hand_of_two(p1, p2, p4);
                  } else {
                    say_card(p2);
                    _(', ');
                    say_hand_of_two(p1, p3, p4);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// 看起来 Cprint_num（打印大写数字如 ONE HUNDRED）只在 0695-read_newspaper 里用到。
// 上下文是 FOGG - DAY {Cprint_num(day)} AND STILL {(day < 50):GOING|NOT HOME}。
// 总之只看这里的上下文的话，需要用 _print_num 来避免出现“第两天”的情况，
// 然后中文也没有大写就只能这样了。
function Cprint_num(p) {
  _print_num(p);
}

// 打印数字。英文里 two 可以使用较多情形，但中文里有二/两之分，这里选了“两”，
// 其它需要“二”的地方只能手动使用 _print_num 了。
// 当然也可以不特殊处理，其实“二英镑”“二只”都勉强可以接受？（不，后者好像不太行。）
function print_num(p) {
  if (p === 2) {
    _('两');
  } else {
    _print_num(p);
  }
}

// 打印数字的主要逻辑，处理了以下情况：
// - 各位之间有时需要加“零”：一百一十/一百“零”一
// - 十位是最高位且小于二十的时候不需要“一”：十一/一百“一”十一
function _print_num(p) {
  if (p >= 10000) {
    _print_num(p / 10000);
    _('万');
    if (p % 10000 > 0) {
      if (p % 10000 < 1000) {
        _('零');
        if (p % 10000 >= 10 && p % 10000 < 20) {
          _('一');
        }
      }
      _print_num(p % 10000);
    }
  } else {
    if (p >= 1000) {
      _print_num(p / 1000);
      _('千');
      if (p % 1000 > 0) {
        if (p % 1000 < 100) {
          _('零');
          if (p % 1000 >= 10 && p % 1000 < 20) {
            _('一');
          }
        }
        _print_num(p % 1000);
      }
    } else {
      if (p >= 100) {
        _print_num(p / 100);
        _('百');
        if (p % 100 > 0) {
          if (p % 100 < 10) {
            _('零');
          } else {
            if (p % 100 < 20) {
              _('一');
            }
          }
          _print_num(p % 100);
        }
      } else {
        if (p >= 10) {
          if (p >= 20) {
            _print_num(p / 10);
          }
          _('十');
          if (p % 10 > 0) {
            _print_num(p % 10);
          }
        } else {
          switch (p) {
            case 1:
              _('一');
              break;
            case 2:
              _('二');
              break;
            case 3:
              _('三');
              break;
            case 4:
              _('四');
              break;
            case 5:
              _('五');
              break;
            case 6:
              _('六');
              break;
            case 7:
              _('七');
              break;
            case 8:
              _('八');
              break;
            case 9:
              _('九');
              break;
          }
        }
      }
    }
  }
}
`;
