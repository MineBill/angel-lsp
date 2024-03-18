// https://www.angelcode.com/angelscript/sdk/docs/manual/doc_script_bnf.html

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
import {ProgramToken} from "./token";
import {
    AccessModifier, EntityModifier,
    NodeARGLIST,
    NodeASSIGN,
    NodeBREAK,
    NodeCASE, NodeCAST,
    NodeCLASS,
    NodeCONDITION, NodeCONSTRUCTCALL,
    NodeCONTINUE,
    NodeDATATYPE,
    NodeDOWHILE,
    NodeEXPR,
    NodeEXPRPOSTOP,
    NodeEXPRPOSTOP1,
    NodeEXPRPOSTOP2,
    NodeEXPRSTAT,
    NodeEXPRTERM2,
    NodeEXPRVALUE,
    NodeFOR,
    NodeFUNC,
    NodeFUNCCALL,
    NodeFUNCDEF,
    NodeIF, NodeLAMBDA, NodeNAMESPACE,
    NodePARAMLIST,
    NodeRETURN,
    NodeSCOPE,
    NodeSCRIPT,
    NodeSTATBLOCK,
    NodeSTATEMENT,
    NodeSWITCH,
    NodeTYPE,
    NodeVAR,
    NodeVARACCESS,
    NodeVIRTPROP,
    NodeWHILE, TypeModifier
} from "./nodes";
import {diagnostic} from "../code/diagnostic";
import {HighlightTokenKind} from "../code/highlight";
import {ParsingState, ParsingToken, TriedParse} from "./parsing";

// SCRIPT        ::= {IMPORT | ENUM | TYPEDEF | CLASS | MIXIN | INTERFACE | FUNCDEF | VIRTPROP | VAR | FUNC | NAMESPACE | ';'}
function parseSCRIPT(parsing: ParsingState): NodeSCRIPT {
    const script: NodeSCRIPT = [];
    while (parsing.isEnd() === false) {
        const func = parseFUNC(parsing);
        if (func !== undefined) {
            script.push(func);
            continue;
        }

        const class_ = parseCLASS(parsing);
        if (class_ === 'pending') continue;
        if (class_ !== 'mismatch') {
            script.push(class_);
            continue;
        }

        const namespace_ = parseNAMESPACE(parsing);
        if (namespace_ === 'pending') continue;
        if (namespace_ !== 'mismatch') {
            script.push(namespace_);
            continue;
        }

        if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            continue;
        }

        break;
    }
    return script;
}

// NAMESPACE     ::= 'namespace' IDENTIFIER {'::' IDENTIFIER} '{' SCRIPT '}'
function parseNAMESPACE(parsing: ParsingState): TriedParse<NodeNAMESPACE> {
    if (parsing.next().text !== 'namespace') return 'mismatch';
    parsing.confirm(HighlightTokenKind.Builtin);

    const namespaces: ProgramToken[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '{') {
            if (namespaces.length === 0) {
                diagnostic.addError(parsing.next().location, "Expected identifier 🐚");
            }
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (namespaces.length > 0) {
            if (parsing.expect('::', HighlightTokenKind.Operator) === false) continue;
        }
        const identifier = parsing.next();
        if (identifier.kind !== 'identifier') {
            diagnostic.addError(parsing.next().location, "Expected identifier 🐚");
            break;
        }
        parsing.confirm(HighlightTokenKind.Namespace);
        namespaces.push(identifier);
    }

    if (namespaces.length === 0) {
        return 'pending';
    }

    const script = parseSCRIPT(parsing);
    parsing.expect('}', HighlightTokenKind.Operator);
    return {
        nodeName: 'NAMESPACE',
        namespaces: namespaces,
        script: script
    };
}

// ENUM          ::= {'shared' | 'external'} 'enum' IDENTIFIER (';' | ('{' IDENTIFIER ['=' EXPR] {',' IDENTIFIER ['=' EXPR]} '}'))

function parseEntityModifier(parsing: ParsingState): EntityModifier | undefined {
    let modifier: EntityModifier | undefined = undefined;
    while (parsing.isEnd() === false) {
        const next = parsing.next().text;
        if (next === 'shared' || next === 'external') {
            if (modifier === undefined) {
                modifier = {isShared: false, isExternal: false};
            }
            if (next === 'shared') modifier.isShared = true;
            else if (next === 'external') modifier.isExternal = true;
            parsing.confirm(HighlightTokenKind.Builtin);
        } else break;
    }

    return modifier;

}

// CLASS         ::= {'shared' | 'abstract' | 'final' | 'external'} 'class' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | FUNC | VAR | FUNCDEF} '}'))
function parseCLASS(parsing: ParsingState): TriedParse<NodeCLASS> {
    if (parsing.next().text !== 'class') return 'mismatch';
    parsing.confirm(HighlightTokenKind.Builtin);
    const identifier = parsing.next();
    if (identifier.kind !== 'identifier') {
        diagnostic.addError(parsing.next().location, "Expected identifier");
        return 'pending';
    }
    parsing.confirm(HighlightTokenKind.Class);
    const bases: ProgramToken[] = [];
    if (parsing.next().text === ':') {
        parsing.confirm(HighlightTokenKind.Operator);
        while (parsing.isEnd() === false) {
            if (parsing.next().text === '{') break;
            if (bases.length > 0) {
                if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
            }
            if (parsing.next().kind !== 'identifier') {
                diagnostic.addError(parsing.next().location, "Expected identifier");
                break;
            }
            bases.push(parsing.next());
            parsing.confirm(HighlightTokenKind.Type);
        }
    }
    parsing.expect('{', HighlightTokenKind.Operator);
    const members: (NodeVIRTPROP | NodeVAR | NodeFUNC | NodeFUNCDEF)[] = [];
    for (; ;) {
        if (parsing.isEnd()) {
            diagnostic.addError(parsing.next().location, "Unexpected end of file");
            break;
        }
        if (parsing.next().text === '}') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        const func = parseFUNC(parsing);
        if (func !== undefined) {
            members.push(func);
            continue;
        }
        const var_ = parseVAR(parsing);
        if (var_ !== undefined) {
            members.push(var_);
            continue;
        }
        diagnostic.addError(parsing.next().location, "Expected class member");
        parsing.step();
    }
    return {
        nodeName: 'CLASS',
        identifier: identifier,
        bases: bases,
        members: members
    };
}

// TYPEDEF       ::= 'typedef' PRIMTYPE IDENTIFIER ';'

// FUNC          ::= {'shared' | 'external'} ['private' | 'protected'] [((TYPE ['&']) | '~')] IDENTIFIER PARAMLIST ['const'] FUNCATTR (';' | STATBLOCK)
function parseFUNC(parsing: ParsingState): NodeFUNC | undefined {
    const rollbackPos = parsing.getPos();
    const entity = parseEntityModifier(parsing);
    const accessor = parseAccessModifier(parsing);
    let head: { returnType: NodeTYPE; isRef: boolean; } | '~';
    if (parsing.next().text === '~') {
        parsing.confirm(HighlightTokenKind.Operator);
        head = '~';
    } else {
        const returnType = parseTYPE(parsing);
        if (returnType === undefined) {
            parsing.setPos(rollbackPos);
            return undefined;
        }
        const isRef = parsing.next().text === '&';
        if (isRef) parsing.confirm(HighlightTokenKind.Builtin);
        head = {returnType: returnType, isRef: isRef};
    }
    const identifier = parsing.next();
    parsing.step();
    const paramList = parsePARAMLIST(parsing);
    if (paramList === undefined) {
        parsing.setPos(rollbackPos);
        return undefined;
    }
    const statBlock = parseSTATBLOCK(parsing) ?? {nodeName: 'STATBLOCK', statements: []};
    return {
        nodeName: 'FUNC',
        entity: entity,
        accessor: accessor,
        head: head,
        identifier: identifier,
        paramList: paramList,
        isConst: false,
        funcAttr: undefined,
        statBlock: statBlock
    };
}

// ['private' | 'protected']
function parseAccessModifier(parsing: ParsingState): AccessModifier {
    const next = parsing.next().text;
    if (next === 'private' || next === 'protected') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return next;
    }
    return 'public';
}

// INTERFACE     ::= {'external' | 'shared'} 'interface' IDENTIFIER (';' | ([':' IDENTIFIER {',' IDENTIFIER}] '{' {VIRTPROP | INTFMTHD} '}'))

// VAR           ::= ['private'|'protected'] TYPE IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST] {',' IDENTIFIER [( '=' (INITLIST | EXPR)) | ARGLIST]} ';'
function parseVAR(parsing: ParsingState): NodeVAR | undefined {
    const rollbackPos = parsing.getPos();

    const accessor: AccessModifier = parseAccessModifier(parsing);

    const type = parseTYPE(parsing);
    if (type === undefined) {
        // diagnostic.addError(parsing.next().location, "Expected type");
        return undefined;
    }
    const variables: {
        identifier: ProgramToken,
        initializer: NodeEXPR | NodeARGLIST | undefined
    }[] = [];
    while (parsing.isEnd() === false) {
        // 識別子
        const identifier = parsing.next();
        if (identifier.kind !== 'identifier') {
            if (variables.length === 0) {
                parsing.setPos(rollbackPos);
                return undefined;
            } else {
                diagnostic.addError(parsing.next().location, "Expected identifier");
            }
        }
        parsing.confirm(HighlightTokenKind.Variable);

        // 初期化子
        if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            variables.push({identifier: identifier, initializer: undefined});
            break;
        } else if (parsing.next().text === '=') {
            parsing.confirm(HighlightTokenKind.Operator);
            const expr = parseEXPR(parsing);
            if (expr === undefined) {
                diagnostic.addError(parsing.next().location, "Expected expression");
                return undefined;
            }
            variables.push({identifier: identifier, initializer: expr});
        } else {
            const argList = parseARGLIST(parsing);
            if (parsing !== undefined) {
                variables.push({identifier: identifier, initializer: argList});
            }
        }

        // 追加または終了判定
        if (parsing.next().text === ',') {
            parsing.confirm(HighlightTokenKind.Operator);
            continue;
        } else if (parsing.next().text === ';') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }

        diagnostic.addError(parsing.next().location, "Expected ',' or ';'");
        parsing.step();
    }

    return {
        nodeName: 'VAR',
        accessor: accessor,
        type: type,
        variables: variables
    };
}

// IMPORT        ::= 'import' TYPE ['&'] IDENTIFIER PARAMLIST FUNCATTR 'from' STRING ';'
// FUNCDEF       ::= {'external' | 'shared'} 'funcdef' TYPE ['&'] IDENTIFIER PARAMLIST ';'
// VIRTPROP      ::= ['private' | 'protected'] TYPE ['&'] IDENTIFIER '{' {('get' | 'set') ['const'] FUNCATTR (STATBLOCK | ';')} '}'
// MIXIN         ::= 'mixin' CLASS
// INTFMTHD      ::= TYPE ['&'] IDENTIFIER PARAMLIST ['const'] ';'

// STATBLOCK     ::= '{' {VAR | STATEMENT} '}'
function parseSTATBLOCK(parsing: ParsingState): NodeSTATBLOCK | undefined {
    if (parsing.next().text !== '{') return undefined;
    parsing.step();
    const statements: (NodeVAR | NodeSTATEMENT)[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '}') break;
        const var_ = parseVAR(parsing);
        if (var_ !== undefined) {
            statements.push(var_);
            continue;
        }
        const statement = parseSTATEMENT(parsing);
        if (statement === 'pending') {
            continue;
        }
        if (statement !== 'mismatch') {
            statements.push(statement);
            continue;
        }
        parsing.step();
    }
    parsing.expect('}', HighlightTokenKind.Keyword);
    return {
        nodeName: 'STATBLOCK',
        statements: statements
    };
}

// PARAMLIST     ::= '(' ['void' | (TYPE TYPEMOD [IDENTIFIER] ['=' EXPR] {',' TYPE TYPEMOD [IDENTIFIER] ['=' EXPR]})] ')'
function parsePARAMLIST(parsing: ParsingState): NodePARAMLIST | undefined {
    if (parsing.next().text !== '(') return undefined;
    if (parsing.next().text === 'void') {
        parsing.confirm(HighlightTokenKind.Builtin);
        parsing.expect(')', HighlightTokenKind.Operator);
        return [];
    }
    parsing.confirm(HighlightTokenKind.Operator);
    const params: NodePARAMLIST = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') break;
        if (params.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        const type = parseTYPE(parsing);
        if (type === undefined) break;
        if (parsing.next().kind === 'identifier') {
            params.push({type: type, identifier: parsing.next()});
            parsing.step();
        } else {
            params.push({type: type, identifier: undefined});
        }
    }

    parsing.expect(')', HighlightTokenKind.Operator);
    return params;
}

// TYPEMOD       ::= ['&' ['in' | 'out' | 'inout']]
function parseTYPEMOD(parsing: ParsingState): TypeModifier | undefined {
    if (parsing.next().text !== '&') return undefined;
    parsing.confirm(HighlightTokenKind.Builtin);
    const next = parsing.next().text;
    if (next === 'in' || next === 'out' || next === 'inout') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return next;
    } else {
        return 'inout';
    }
}

// TYPE          ::= ['const'] SCOPE DATATYPE ['<' TYPE {',' TYPE} '>'] { ('[' ']') | ('@' ['const']) }
function parseTYPE(parsing: ParsingState): NodeTYPE | undefined {
    const rollbackPos = parsing.getPos();
    let isConst = false;
    if (parsing.next().text === 'const') {
        parsing.confirm(HighlightTokenKind.Keyword);
        isConst = true;
    }
    const scope = parseSCOPE(parsing);
    const datatype = parseDATATYPE(parsing);
    if (datatype === undefined) {
        parsing.setPos(rollbackPos);
        return undefined;
    }
    const generics = parseTypeParameters(parsing) ?? [];
    return {
        nodeName: 'TYPE',
        isConst: isConst,
        scope: scope,
        datatype: datatype,
        generics: generics,
        array: false,
        ref: false
    };
}

// '<' TYPE {',' TYPE} '>'
function parseTypeParameters(parsing: ParsingState): NodeTYPE[] | undefined {
    const rollbackPos = parsing.getPos();
    if (parsing.next().text !== '<') return undefined;
    parsing.confirm(HighlightTokenKind.Operator);
    const generics: NodeTYPE[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === '>') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (generics.length > 0) {
            if (parsing.next().text !== ',') {
                parsing.setPos(rollbackPos);
                return undefined;
            }
            parsing.confirm(HighlightTokenKind.Operator);
        }
        const type = parseTYPE(parsing);
        if (type === undefined) {
            parsing.setPos(rollbackPos);
            return undefined;
        }
        generics.push(type);
    }
    if (generics.length == 0) {
        diagnostic.addError(parsing.next().location, "Expected type parameter 🪹");
    }
    return generics;
}

// INITLIST      ::= '{' [ASSIGN | INITLIST] {',' [ASSIGN | INITLIST]} '}'

// SCOPE         ::= ['::'] {IDENTIFIER '::'} [IDENTIFIER ['<' TYPE {',' TYPE} '>'] '::']
function parseSCOPE(parsing: ParsingState): NodeSCOPE | undefined {
    let isGlobal = false;
    if (parsing.next().text === '::') {
        parsing.confirm(HighlightTokenKind.Operator);
        isGlobal = true;
    }
    const namespaces: ProgramToken[] = [];
    while (parsing.isEnd() === false) {
        const identifier = parsing.next(0);
        if (identifier.kind !== 'identifier') {
            break;
        }
        if (parsing.next(1).text === '::') {
            parsing.confirm(HighlightTokenKind.Namespace);
            parsing.confirm(HighlightTokenKind.Operator);
            namespaces.push(identifier);
            continue;
        } else if (parsing.next(1).text === '<') {
            const rollbackPos = parsing.getPos();
            parsing.confirm(HighlightTokenKind.Class);
            const types = parseTypeParameters(parsing);
            if (types === undefined || parsing.next().text !== '::') {
                parsing.setPos(rollbackPos);
                break;
            }
            parsing.confirm(HighlightTokenKind.Operator);
            return {
                nodeName: 'SCOPE',
                isGlobal: isGlobal,
                namespaces: namespaces,
                generic: {className: identifier, types: types}
            };
        }
        break;
    }
    if (isGlobal === false && namespaces.length === 0) {
        return undefined;
    }
    return {
        nodeName: 'SCOPE',
        isGlobal: isGlobal,
        namespaces: namespaces,
        generic: undefined
    };
}

// DATATYPE      ::= (IDENTIFIER | PRIMTYPE | '?' | 'auto')
function parseDATATYPE(parsing: ParsingState): NodeDATATYPE | undefined {
    // FIXME
    const next = parsing.next();
    if (parsing.next().kind === 'identifier') {
        parsing.confirm(HighlightTokenKind.Type);
        return {
            nodeName: 'DATATYPE',
            identifier: next
        };
    }

    const primtype = parsePRIMTYPE(parsing);
    if (primtype !== undefined) return {
        nodeName: 'DATATYPE',
        identifier: primtype
    };

    return undefined;
}

// PRIMTYPE      ::= 'void' | 'int' | 'int8' | 'int16' | 'int32' | 'int64' | 'uint' | 'uint8' | 'uint16' | 'uint32' | 'uint64' | 'float' | 'double' | 'bool'
function parsePRIMTYPE(parsing: ParsingState) {
    const next = parsing.next();
    if (primeTypeSet.has(next.text) === false) return undefined;
    parsing.confirm(HighlightTokenKind.Builtin);
    return next;
}

const primeTypeSet = new Set<string>(['void', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float', 'double', 'bool']);

// FUNCATTR      ::= {'override' | 'final' | 'explicit' | 'property'}

// STATEMENT     ::= (IF | FOR | WHILE | RETURN | STATBLOCK | BREAK | CONTINUE | DOWHILE | SWITCH | EXPRSTAT | TRY)
function parseSTATEMENT(parsing: ParsingState): TriedParse<NodeSTATEMENT> {
    const if_ = parseIF(parsing);
    if (if_ === 'pending') return 'pending';
    if (if_ !== 'mismatch') return if_;

    const for_ = parseFOR(parsing);
    if (for_ === 'pending') return 'pending';
    if (for_ !== 'mismatch') return for_;

    const while_ = parseWHILE(parsing);
    if (while_ === 'pending') return 'pending';
    if (while_ !== 'mismatch') return while_;

    const return_ = parseRETURN(parsing);
    if (return_ === 'pending') return 'pending';
    if (return_ !== 'mismatch') return return_;

    const statBlock = parseSTATBLOCK(parsing);
    if (statBlock !== undefined) return statBlock;

    const break_ = parseBREAK(parsing);
    if (break_ !== undefined) return break_;

    const continue_ = parseCONTINUE(parsing);
    if (continue_ !== undefined) return continue_;

    const dowhile = parseDOWHILE(parsing);
    if (dowhile === 'pending') return 'pending';
    if (dowhile !== 'mismatch') return dowhile;

    const switch_ = parseSWITCH(parsing);
    if (switch_ === 'pending') return 'pending';
    if (switch_ !== 'mismatch') return switch_;

    const exprStat = parseEXPRSTAT(parsing);
    if (exprStat !== undefined) return exprStat;

    return 'mismatch';
}

// SWITCH        ::= 'switch' '(' ASSIGN ')' '{' {CASE} '}'
function parseSWITCH(parsing: ParsingState): TriedParse<NodeSWITCH> {
    if (parsing.next().text !== 'switch') return 'mismatch';
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    parsing.expect('{', HighlightTokenKind.Operator);
    const cases: NodeCASE[] = [];

    while (parsing.isEnd() === false) {
        if (parsing.isEnd() || parsing.next().text === '}') break;
        const case_ = parseCASE(parsing);
        if (case_ === 'mismatch') break;
        if (case_ === 'pending') continue;
        cases.push(case_);
    }
    parsing.expect('}', HighlightTokenKind.Operator);
    return {
        nodeName: 'SWITCH',
        assign: assign,
        cases: cases
    };
}

// BREAK         ::= 'break' ';'
function parseBREAK(parsing: ParsingState): NodeBREAK | undefined {
    if (parsing.next().text !== 'break') return undefined;
    parsing.step();
    parsing.expect(';', HighlightTokenKind.Operator);
    return {nodeName: 'BREAK'};
}

// FOR           ::= 'for' '(' (VAR | EXPRSTAT) EXPRSTAT [ASSIGN {',' ASSIGN}] ')' STATEMENT
function parseFOR(parsing: ParsingState): TriedParse<NodeFOR> {
    if (parsing.next().text !== 'for') return 'mismatch';
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);

    const initial: NodeEXPRSTAT | NodeVAR | undefined = parseEXPRSTAT(parsing) ?? parseVAR(parsing);
    if (initial === undefined) {
        diagnostic.addError(parsing.next().location, "Expected initial expression or variable declaration");
        return 'pending';
    }

    const condition = parseEXPRSTAT(parsing);
    if (condition === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }

    const increment: NodeASSIGN[] = [];
    while (parsing.isEnd() === false) {
        if (increment.length > 0) {
            if (parsing.next().text !== ',') break;
            parsing.step();
        }
        const assign = parseASSIGN(parsing);
        if (assign === undefined) break;
        increment.push(assign);
    }

    parsing.expect(')', HighlightTokenKind.Operator);

    const statement = parseSTATEMENT(parsing);
    if (statement === 'mismatch' || statement === 'pending') return 'pending';

    return {
        nodeName: 'FOR',
        initial: initial,
        condition: condition,
        increment: increment,
        statement: statement
    };
}

// WHILE         ::= 'while' '(' ASSIGN ')' STATEMENT
function parseWHILE(parsing: ParsingState): TriedParse<NodeWHILE> {
    if (parsing.next().text !== 'while') return 'mismatch';
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    const statement = parseSTATEMENT(parsing);
    if (statement === 'mismatch' || statement === 'pending') {
        diagnostic.addError(parsing.next().location, "Expected statement");
        return 'pending';
    }

    return {
        nodeName: 'WHILE',
        assign: assign,
        statement: statement
    };
}

// DOWHILE       ::= 'do' STATEMENT 'while' '(' ASSIGN ')' ';'
function parseDOWHILE(parsing: ParsingState): TriedParse<NodeDOWHILE> {
    if (parsing.next().text !== 'do') return 'mismatch';
    parsing.step();
    const statement = parseSTATEMENT(parsing);
    if (statement === 'mismatch' || statement === 'pending') {
        diagnostic.addError(parsing.next().location, "Expected statement");
        return 'pending';
    }
    parsing.expect('while', HighlightTokenKind.Keyword);
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: 'DOWHILE',
        statement: statement,
        assign: assign
    };
}

// IF            ::= 'if' '(' ASSIGN ')' STATEMENT ['else' STATEMENT]
function parseIF(parsing: ParsingState): TriedParse<NodeIF> {
    if (parsing.next().text !== 'if') return 'mismatch';
    parsing.step();
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected condition expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    const ts = parseSTATEMENT(parsing);
    if (ts === 'mismatch' || ts === 'pending') return 'pending';
    let fs = undefined;
    if (parsing.next().text === 'else') {
        fs = parseSTATEMENT(parsing);
        if (fs === 'mismatch' || fs === 'pending') {
            diagnostic.addError(parsing.next().location, "Expected statement");
            return {
                nodeName: 'IF',
                condition: assign,
                ts: ts,
                fs: undefined
            };
        }
    }
    return {
        nodeName: 'IF',
        condition: assign,
        ts: ts,
        fs: fs
    };
}

// CONTINUE      ::= 'continue' ';'
function parseCONTINUE(parsing: ParsingState): NodeCONTINUE | undefined {
    if (parsing.next().text !== 'continue') return undefined;
    parsing.step();
    parsing.expect(';', HighlightTokenKind.Operator);
    return {nodeName: 'CONTINUE'};
}

// EXPRSTAT      ::= [ASSIGN] ';'
function parseEXPRSTAT(parsing: ParsingState): NodeEXPRSTAT | undefined {
    if (parsing.next().text === ';') {
        parsing.confirm(HighlightTokenKind.Operator);
        return {
            nodeName: "EXPRSTAT",
            assign: undefined
        };
    }
    const assign = parseASSIGN(parsing);
    if (assign === undefined) return undefined;
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: "EXPRSTAT",
        assign: assign
    };
}

// TRY           ::= 'try' STATBLOCK 'catch' STATBLOCK

// RETURN        ::= 'return' [ASSIGN] ';'
function parseRETURN(parsing: ParsingState): TriedParse<NodeRETURN> {
    if (parsing.next().text !== 'return') return 'mismatch';
    parsing.step();
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return 'pending';
    }
    parsing.expect(';', HighlightTokenKind.Operator);
    return {
        nodeName: 'RETURN',
        assign: assign
    };
}

// CASE          ::= (('case' EXPR) | 'default') ':' {STATEMENT}
function parseCASE(parsing: ParsingState): TriedParse<NodeCASE> {
    let expr = undefined;
    if (parsing.next().text === 'case') {
        parsing.step();
        expr = parseEXPR(parsing);
        if (expr === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression");
            return 'pending';
        }
    } else if (parsing.next().text === 'default') {
        parsing.step();
    } else {
        return 'mismatch';
    }
    parsing.expect(':', HighlightTokenKind.Operator);
    const statements: NodeSTATEMENT[] = [];
    while (parsing.isEnd() === false) {
        const statement = parseSTATEMENT(parsing);
        if (statement === 'mismatch') break;
        if (statement === 'pending') continue;
        statements.push(statement);
    }
    return {
        nodeName: 'CASE',
        expr: expr,
        statements: statements
    };
}

// EXPR          ::= EXPRTERM {EXPROP EXPRTERM}
function parseEXPR(parsing: ParsingState): NodeEXPR | undefined {
    const exprTerm = parseEXPRTERM(parsing);
    if (exprTerm === undefined) return undefined;
    const exprOp = parseEXPROP(parsing);
    if (exprOp === undefined) return {
        nodeName: 'EXPR',
        head: exprTerm,
        op: undefined,
        tail: undefined
    };
    const tail = parseEXPR(parsing);
    if (tail === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return {
            nodeName: 'EXPR',
            head: exprTerm,
            op: undefined,
            tail: undefined
        };
    }
    return {
        nodeName: 'EXPR',
        head: exprTerm,
        op: exprOp,
        tail: tail
    };
}

// EXPRTERM      ::= ([TYPE '='] INITLIST) | ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseEXPRTERM(parsing: ParsingState) {
    const exprTerm2 = parseEXPRTERM2(parsing);
    if (exprTerm2 !== undefined) return exprTerm2;
    return undefined;
}

const preOpSet = new Set(['-', '+', '!', '++', '--', '~', '@']);

// const postOpSet = new Set(['.', '[', '(', '++', '--']);

// ({EXPRPREOP} EXPRVALUE {EXPRPOSTOP})
function parseEXPRTERM2(parsing: ParsingState): NodeEXPRTERM2 | undefined {
    const rollbackPos = parsing.getPos();
    let pre = undefined;
    if (preOpSet.has(parsing.next().text)) {
        pre = parsing.next();
        parsing.confirm(HighlightTokenKind.Operator);
    }

    const exprValue = parseEXPRVALUE(parsing);
    if (exprValue === 'mismatch') parsing.setPos(rollbackPos);
    if (exprValue === 'mismatch' || exprValue === 'pending') {
        return undefined;
    }

    const postOp = parseEXPRPOSTOP(parsing);

    return {
        nodeName: 'EXPRTERM',
        exprTerm: 2,
        preOp: pre,
        value: exprValue,
        postOp: postOp
    };
}

// EXPRVALUE     ::= 'void' | CONSTRUCTCALL | FUNCCALL | VARACCESS | CAST | LITERAL | '(' ASSIGN ')' | LAMBDA
function parseEXPRVALUE(parsing: ParsingState): TriedParse<NodeEXPRVALUE> {
    const lambda = parseLAMBDA(parsing);
    if (lambda === 'pending') return 'pending';
    if (lambda !== 'mismatch') return lambda;

    const cast = parseCAST(parsing);
    if (cast === 'pending') return 'pending';
    if (cast !== 'mismatch') return cast;

    if (parsing.next().text === '(') {
        parsing.confirm(HighlightTokenKind.Operator);
        const assign = parseASSIGN(parsing);
        if (assign === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🖼️");
            return 'pending';
        }
        parsing.expect(')', HighlightTokenKind.Operator);
        return assign;
    }

    const literal = parseLITERAL(parsing);
    if (literal !== undefined) return {nodeName: 'LITERAL', value: literal};

    const funcCall = parseFUNCCALL(parsing);
    if (funcCall !== undefined) return funcCall;

    const constructCall = parseCONSTRUCTCALL(parsing);
    if (constructCall !== undefined) return constructCall;

    const varAccess = parseVARACCESS(parsing);
    if (varAccess !== undefined) return varAccess;

    return 'mismatch';
}

// CONSTRUCTCALL ::= TYPE ARGLIST
function parseCONSTRUCTCALL(parsing: ParsingState): NodeCONSTRUCTCALL | undefined {
    const rollbackPos = parsing.getPos();
    const type = parseTYPE(parsing);
    if (type === undefined) return undefined;

    const argList = parseARGLIST(parsing);
    if (argList === undefined) {
        parsing.setPos(rollbackPos);
        return undefined;
    }

    return {
        nodeName: 'CONSTRUCTCALL',
        type: type,
        argList: argList
    };
}

// EXPRPREOP     ::= '-' | '+' | '!' | '++' | '--' | '~' | '@'

// EXPRPOSTOP    ::= ('.' (FUNCCALL | IDENTIFIER)) | ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']') | ARGLIST | '++' | '--'
function parseEXPRPOSTOP(parsing: ParsingState): NodeEXPRPOSTOP | undefined {
    const exprPostOp1 = parseEXPRPOSTOP1(parsing);
    if (exprPostOp1 !== undefined) return exprPostOp1;

    const exprPostOp2 = parseEXPRPOSTOP2(parsing);
    if (exprPostOp2 !== undefined) return exprPostOp2;

    const argList = parseARGLIST(parsing);
    if (argList !== undefined) return {
        nodeName: 'EXPRPOSTOP',
        postOp: 3,
        args: argList
    };

    const maybeOperator = parsing.next().text;
    if (maybeOperator === '++' || maybeOperator === '--') {
        parsing.confirm(HighlightTokenKind.Operator);
        return {
            nodeName: 'EXPRPOSTOP',
            postOp: 4,
            operator: maybeOperator
        };
    }

    return undefined;
}

// ('.' (FUNCCALL | IDENTIFIER))
function parseEXPRPOSTOP1(parsing: ParsingState): NodeEXPRPOSTOP1 | undefined {
    if (parsing.next().text !== '.') return undefined;
    parsing.confirm(HighlightTokenKind.Operator);
    const funcCall = parseFUNCCALL(parsing);
    if (funcCall !== undefined) return {
        nodeName: 'EXPRPOSTOP',
        postOp: 1,
        member: funcCall,
    };
    const identifier = parsing.next();
    if (identifier.kind !== 'identifier') {
        diagnostic.addError(parsing.next().location, "Expected identifier");
        return undefined;
    }
    parsing.confirm(HighlightTokenKind.Variable);
    return {
        nodeName: 'EXPRPOSTOP',
        postOp: 1,
        member: identifier
    };
}

// ('[' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':' ASSIGN} ']')
function parseEXPRPOSTOP2(parsing: ParsingState): NodeEXPRPOSTOP2 | undefined {
    if (parsing.next().text !== '[') return undefined;
    parsing.confirm(HighlightTokenKind.Operator);
    const indexes: { identifier: ProgramToken | undefined, assign: NodeASSIGN }[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ']') {
            if (indexes.length === 0) {
                diagnostic.addError(parsing.next().location, "Expected index 📮");
            }
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (indexes.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        let identifier = undefined;
        if (parsing.next(0).kind === 'identifier' && parsing.next(1).text === ':') {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Parameter);
            parsing.confirm(HighlightTokenKind.Operator);
        }
        const assign = parseASSIGN(parsing);
        if (assign === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 📮");
            continue;
        }
        indexes.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: 'EXPRPOSTOP',
        postOp: 2,
        indexes: indexes
    };
}

// CAST          ::= 'cast' '<' TYPE '>' '(' ASSIGN ')'
function parseCAST(parsing: ParsingState): TriedParse<NodeCAST> {
    if (parsing.next().text !== 'cast') return 'mismatch';
    parsing.confirm(HighlightTokenKind.Keyword);
    parsing.expect('<', HighlightTokenKind.Operator);
    const type = parseTYPE(parsing);
    if (type === undefined) {
        diagnostic.addError(parsing.next().location, "Expected type");
        return 'pending';
    }
    parsing.expect('>', HighlightTokenKind.Operator);
    parsing.expect('(', HighlightTokenKind.Operator);
    const assign = parseASSIGN(parsing);
    if (assign === undefined) {
        diagnostic.addError(parsing.next().location, "Expected expression");
        return 'pending';
    }
    parsing.expect(')', HighlightTokenKind.Operator);
    return {
        nodeName: 'CAST',
        type: type,
        assign: assign
    };
}

// LAMBDA        ::= 'function' '(' [[TYPE TYPEMOD] [IDENTIFIER] {',' [TYPE TYPEMOD] [IDENTIFIER]}] ')' STATBLOCK
const parseLAMBDA = (parsing: ParsingState): TriedParse<NodeLAMBDA> => {
    if (parsing.next().text !== 'function') return 'mismatch';
    parsing.confirm(HighlightTokenKind.Keyword);
    parsing.expect('(', HighlightTokenKind.Operator);
    const params: {
        type: NodeTYPE | undefined,
        typeMod: TypeModifier | undefined,
        identifier: ProgramToken | undefined
    }[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (params.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) continue;
        }

        if (parsing.next(0).kind === 'identifier' && parsing.next(1).kind === 'reserved') {
            parsing.confirm(HighlightTokenKind.Parameter);
            params.push({type: undefined, typeMod: undefined, identifier: parsing.next()});
            continue;
        }

        const type = parseTYPE(parsing);
        const typeMod = type !== undefined ? parseTYPEMOD(parsing) : undefined;

        let identifier: ProgramToken | undefined = undefined;
        if (parsing.next().kind === 'identifier') {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Parameter);
        }
        params.push({type: type, typeMod: typeMod, identifier: identifier});
    }
    const statBlock = parseSTATBLOCK(parsing);
    if (statBlock === undefined) {
        diagnostic.addError(parsing.next().location, "Expected statement block 🪔");
        return 'pending';
    }
    return {
        nodeName: 'LAMBDA',
        params: params,
        statBlock: statBlock
    };
};

// LITERAL       ::= NUMBER | STRING | BITS | 'true' | 'false' | 'null'
function parseLITERAL(parsing: ParsingState) {
    const next = parsing.next();
    if (next.kind === 'number') {
        parsing.confirm(HighlightTokenKind.Number);
        return next;
    }
    if (next.kind === 'string') {
        parsing.confirm(HighlightTokenKind.String);
        return next;
    }
    if (next.text === 'true' || next.text === 'false' || next.text === 'null') {
        parsing.confirm(HighlightTokenKind.Builtin);
        return next;
    }
    return undefined;
}

// FUNCCALL      ::= SCOPE IDENTIFIER ARGLIST
function parseFUNCCALL(parsing: ParsingState): NodeFUNCCALL | undefined {
    const rollbackPos = parsing.getPos();
    const scope = parseSCOPE(parsing);
    const identifier = parsing.next();
    if (identifier.kind !== 'identifier') {
        parsing.setPos(rollbackPos);
        return undefined;
    }
    parsing.confirm(HighlightTokenKind.Function);
    const argList = parseARGLIST(parsing);
    if (argList === undefined) {
        parsing.setPos(rollbackPos);
        return undefined;
    }
    return {
        nodeName: 'FUNCCALL',
        scope: scope,
        identifier: identifier,
        argList: argList
    };
}

// VARACCESS     ::= SCOPE IDENTIFIER
function parseVARACCESS(parsing: ParsingState): NodeVARACCESS | undefined {
    const scope = parseSCOPE(parsing);
    const next = parsing.next();
    if (next.kind !== 'identifier') {
        if (scope !== undefined) {
            diagnostic.addError(parsing.next().location, "Expected identifier");
        }
        return undefined;
    }
    const isBuiltin: boolean = next.text === 'this';
    parsing.confirm(isBuiltin ? HighlightTokenKind.Builtin : HighlightTokenKind.Variable);
    return {
        nodeName: 'VARACCESS',
        scope: scope,
        identifier: next
    };
}

// ARGLIST       ::= '(' [IDENTIFIER ':'] ASSIGN {',' [IDENTIFIER ':'] ASSIGN} ')'
function parseARGLIST(parsing: ParsingState): NodeARGLIST | undefined {
    if (parsing.next().text !== '(') return undefined;
    parsing.confirm(HighlightTokenKind.Operator);
    const args: { identifier: ProgramToken | undefined, assign: NodeASSIGN }[] = [];
    while (parsing.isEnd() === false) {
        if (parsing.next().text === ')') {
            parsing.confirm(HighlightTokenKind.Operator);
            break;
        }
        if (args.length > 0) {
            if (parsing.expect(',', HighlightTokenKind.Operator) === false) break;
        }
        let identifier = undefined;
        if (parsing.next().kind === 'identifier' && parsing.next(1).text === ':') {
            identifier = parsing.next();
            parsing.confirm(HighlightTokenKind.Parameter);
            parsing.confirm(HighlightTokenKind.Operator);
        }
        const assign = parseASSIGN(parsing);
        if (assign === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🍡");
            parsing.step();
            continue;
        }
        args.push({identifier: identifier, assign: assign});
    }
    return {
        nodeName: 'ARGLIST',
        args: args
    };
}

// ASSIGN        ::= CONDITION [ ASSIGNOP ASSIGN ]
function parseASSIGN(parsing: ParsingState): NodeASSIGN | undefined {
    const condition = parseCONDITION(parsing);
    if (condition === undefined) return undefined;
    const op = parseASSIGNOP(parsing);
    const result: NodeASSIGN = {
        nodeName: 'ASSIGN',
        condition: condition,
        tail: undefined
    };
    if (op === undefined) return result;
    const assign = parseASSIGN(parsing);
    if (assign === undefined) return result;
    result.tail = {op: op, assign: assign};
    return result;
}

// CONDITION     ::= EXPR ['?' ASSIGN ':' ASSIGN]
function parseCONDITION(parsing: ParsingState): NodeCONDITION | undefined {
    const expr = parseEXPR(parsing);
    if (expr === undefined) return undefined;
    const result: NodeCONDITION = {
        nodeName: 'CONDITION',
        expr: expr,
        ternary: undefined
    };
    if (parsing.next().text === '?') {
        parsing.confirm(HighlightTokenKind.Operator);
        const ta = parseASSIGN(parsing);
        if (ta === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🤹");
            return result;
        }
        parsing.expect(':', HighlightTokenKind.Operator);
        const fa = parseASSIGN(parsing);
        if (fa === undefined) {
            diagnostic.addError(parsing.next().location, "Expected expression 🤹");
            return result;
        }
        result.ternary = {ta: ta, fa: fa};
    }
    return result;
}

// EXPROP        ::= MATHOP | COMPOP | LOGICOP | BITOP
function parseEXPROP(parsing: ParsingState) {
    if (exprOpSet.has(parsing.next().text) === false) return undefined;
    const next = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);
    return next;
}

const exprOpSet = new Set([
    '+', '-', '*', '/', '%', '**',
    '==', '!=', '<', '<=', '>', '>=', 'is',
    '&&', '||', '^^', 'and', 'or', 'xor',
    '&', '|', '^', '<<', '>>', '>>>'
]);

// BITOP         ::= '&' | '|' | '^' | '<<' | '>>' | '>>>'
// MATHOP        ::= '+' | '-' | '*' | '/' | '%' | '**'
// COMPOP        ::= '==' | '!=' | '<' | '<=' | '>' | '>=' | 'is' | '!is'
// LOGICOP       ::= '&&' | '||' | '^^' | 'and' | 'or' | 'xor'

// ASSIGNOP      ::= '=' | '+=' | '-=' | '*=' | '/=' | '|=' | '&=' | '^=' | '%=' | '**=' | '<<=' | '>>=' | '>>>='
function parseASSIGNOP(parsing: ParsingState) {
    if (assignOpSet.has(parsing.next().text) === false) return undefined;
    const next = parsing.next();
    parsing.confirm(HighlightTokenKind.Operator);
    return next;
}

const assignOpSet = new Set([
    '=', '+=', '-=', '*=', '/=', '|=', '&=', '^=', '%=', '**=', '<<=', '>>=', '>>>='
]);

export function parseFromTokens(tokens: ParsingToken[]): NodeSCRIPT {
    const parsing = new ParsingState(tokens);
    const script: NodeSCRIPT = [];
    while (parsing.isEnd() === false) {
        script.push(...parseSCRIPT(parsing));
        if (parsing.isEnd() === false) {
            diagnostic.addError(parsing.next().location, "Unexpected token ⚠️");
            parsing.step();
        }
    }

    return script;
}
