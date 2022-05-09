// initialize the php parser factory class
const fs = require("fs");
const path = require("path");
const engine = require("php-parser");
//var logger = require('./logger')(module);

const currentFile = "./example.php";
let g_methodName = "";
let g_currentCls = null;

function getClassFromFile(parsedProgram) {

  let queue = [];
  let foundClasses = [];

    for (index in parsedProgram.children) {
        let child = parsedProgram.children[index];
        queue.push(child);

    }

    while (queue.length > 0) {

        let currentChild = queue.pop();

        if ("children" in currentChild) {
            for (index in currentChild.children) {
                let child = currentChild.children[index];
                queue.push(child);
            }
        }

        if (currentChild.kind === "class") {
            console.log("Found class: " + currentChild);
            foundClasses.push(currentChild);
        }
    }

    return foundClasses;
}

function findClassByParentName(classes, expectedName) {

    let foundCls = [];

    for(cls of classes) {
        if("extends" in cls && cls.extends.name === expectedName) {

            console.log("Found class that inherits from " + expectedName + " : " + cls.name.name);
            foundCls.push(cls);
        }
    }

    return foundCls;
}

function enumerateMethods(class_def) {

    let allMethods = [];

    if(!"body" in class_def) {
        console.error("Invalid class object");
        return allMethods;
    }

    for(child of class_def.body) {

        if(child.kind === "method") {
            //console.log("Found method: " + class_def.name.name+"->" + child.name.name);
            allMethods.push(child);
        }
    }

    return allMethods;
}

function enumerateMethodsWithName(class_def, methodName) {
    let foundMethods = [];
    let allMethods = enumerateMethods(class_def);

    for(let method of allMethods) {
        if(method.name.name === methodName) {
            foundMethods.push(method);
        }
    }

    return foundMethods;
}

function findMethodsByNumberOfArguments(allMethods, numberOfArgs) {

    let filtered = [];

    for(method of allMethods) {

        if(method.arguments.length  === numberOfArgs) {
            console.log("Found method with " + numberOfArgs + " arguments: " + method.name.name);
            filtered.push(method);
        }
    }

    return filtered;
}

function extractLocation(file, loc) {
    let lines = [];
    const allFileContents = fs.readFileSync(file, 'utf-8');
    allFileContents.split(/\r?\n/).forEach(line =>  {
        lines.push(line);
    });

    let start = loc.start.line;
    let end = loc.end.line;

    if (start === end) {
        let line = lines[start-1];
        let extracted = line.substr(loc.start.column, loc.end.column);
        return extracted;
    } else {
        let result = "";
        for(let i = start ; i < end ; i++) {
            let line = lines[i-1];

            if(i === 0) {
                result += line.substr(loc.start.column);
            } else if(i === end) {
                result += line.substr(0, loc.end.column);
            }
             else{
                result += line;
            }
        }

        //console.log("Extracted result: " + result);
        return result;
    }
}

function analyzeCallExpr(child, indentLevel=1) {

    let printable = "";
    let token = extractLocation(currentFile, child.loc);
    if (child.what.kind === "propertylookup") {
        let derefChain = "";
        let currentDeref = child.what;
        let methodName = "";
        while("what" in currentDeref) {
            if("offset" in currentDeref && currentDeref.offset.kind === "identifier")
                methodName = currentDeref.offset.name;
            if("offset" in currentDeref){
                let suffix = derefChain.length === 0 ? "" : "->" + derefChain;
                derefChain = currentDeref.offset.name + suffix;
            }
            else{
                let suffix = derefChain.length === 0 ? "" : "->" + derefChain;
                derefChain = currentDeref.name + suffix;
            }
            currentDeref = currentDeref.what;
        }
        let prefix = indentLevel < 1 ? "│   " : "│   ";
        printable += prefix + "│   ".repeat(indentLevel) + `[${child.loc.start.line}] calling $` + currentDeref.name + "->" + derefChain + "\n";
        printable +=  analyzeOwnMethodBody(methodName, child.arguments, indentLevel);
        //printable += "\n";

        if (child.arguments.length > 0) {
            for (let arg of child.arguments) {
                if (arg.kind === "call") {
                    printable +=  dispatchChildren([arg], indentLevel );
                }
            }
        }
    } else{
        console.error("TODO: handle this case @ line " + child.loc.start.line + ": " + token);
    }
    return printable;
}

function analyzeAssign(child, indentLevel = 1) {

    let token = extractLocation(currentFile, child.loc);
    let writesTo = "";
    let nextNodes = "";
    let prefix = indentLevel < 1 ? "│   " : "│   ";

    if("what" in child.left) {
        writesTo = child.left.what.name;
        if (writesTo === "this") {
            writesTo += "->";
        }
        writesTo += child.left.offset.name;
    } else {
        writesTo = child.left.name;
    }
    let readsFrom = "unknown (TODO)";
    if(child.right.kind === "variable") {
        readsFrom = child.right.name;
    } else if(child.right.kind === "call") {
        readsFrom = "callexpr";
        nextNodes = analyzeCallExpr(child.right, indentLevel);
    }
    else {
        console.error("analyzeAssign::unhandled right kind " + child.right.kind);
    }

    return prefix + "│   ".repeat(indentLevel) + `[${child.loc.start.line}] writing to $` + writesTo + " from " + readsFrom + "\n"+ nextNodes;// + " ( " + token + " ) ";
}

function analyzeIf(child, indentLevel = 1) {

    //let token = extractLocation(currentFile, child.loc);
    let res = "";
    if(child.test.kind === "call") {
        res += analyzeCallExpr(child.test, indentLevel);
    }

    res += dispatchChildren(child.body.children, indentLevel);
    return res;
}

function analyzeOwnMethodBody(methodName, arguments, indentLevel = 1) {

    let matchingMethods = enumerateMethodsWithName(g_currentCls, methodName);

    if(matchingMethods.length === 0) {
        console.error("Could not find a method with name " + methodName + " in the current class");
        return "";
    }

    if(matchingMethods.length > 1) {
        console.log("More than 1 method with the same name. Trying to isolate the good one by checking the number of args");
        let filtered = findMethodsByNumberOfArguments(matchingMethods, arguments.length);
        if(filtered.length === 0) {
            console.error("wtf");
            return "";
        }

        if(filtered.length > 1) {
            console.error("More than 1 method with these number of args :(");
            return "";
        }

        return displayCallGraph(filtered[0], indentLevel+1, false);
    } else {
        return displayCallGraph(matchingMethods[0], indentLevel+1, false);
    }
}

function dispatchChildren(children, indentLevel = 1) {

    let queue = [];
    let printable = "";

    for(child of children) {
        queue.push(child);
    }

    while(queue.length > 0) {

        let prefix = indentLevel < 1 ? "│   " : "│   ";
        let child = queue.pop();
        try {
            let kind = child.kind;
            if (kind === "expressionstatement") {
                kind = child.expression.kind;
            }

            switch (kind) {

                case "call":
                    if ("expression" in child) {
                        let res = analyzeCallExpr(child.expression, indentLevel);
                        printable += res;
                    } else if (child.what.kind === "propertylookup") {
                        let derefChain = "";
                        let currentDeref = child.what;
                        let methodName = "";
                        while("what" in currentDeref) {
                            if("offset" in currentDeref && currentDeref.offset.kind === "identifier")
                                methodName = currentDeref.offset.name;
                            if("offset" in currentDeref){
                                let suffix = derefChain.length === 0 ? "" : "->" + derefChain;
                                derefChain = currentDeref.offset.name + suffix;
                            }
                            else{
                                let suffix = derefChain.length === 0 ? "" : "->" + derefChain;
                                derefChain = currentDeref.name + suffix;
                            }
                            currentDeref = currentDeref.what;
                        }

                        printable += prefix + "│   ".repeat(indentLevel) + `[${child.loc.start.line}] calling $` + currentDeref.name + "->" + derefChain + "\n";
                        printable += analyzeOwnMethodBody(methodName, child.arguments, indentLevel );
                        //printable += "\n";

                        if (child.arguments.length > 0) {
                            for (let arg of child.arguments) {
                                if (arg.kind === "call") {
                                    queue.push(arg);
                                }
                            }
                        }
                    } else {
                        console.error("Unhandled callexpr: " + child);
                    }
                    break;
                case "assign":
                    let r = analyzeAssign(child.expression, indentLevel);
                    printable += r;
                    break;
                case "if":
                    let ifRes = analyzeIf(child, indentLevel );
                    printable += ifRes;
                    break;
                case "return":
                    //printable += extractLocation(currentFile, child.loc) + "\n";
                    queue.push(child.expr);
                    break;
                case "variable":
                    printable += prefix + "│   ".repeat(indentLevel) + `[${child.loc.start.line}] reading $` + child.name + "\n";
                    break;
                case "propertylookup":
                    if("offset" in child) {
                        printable +=  prefix + "│   ".repeat(indentLevel) + `[${child.loc.start.line}] reading $` + child.offset.name;
                    } else if (child.what.kind === "variable"){
                        printable += "\n" + prefix + "│   ".repeat(indentLevel) + `[${child.loc.start.line}] reading $` + child.what.name
                    } else {
                        console.error("│    ".repeat(indentLevel) + "TODO @ line " + child.loc.start.line);
                    }
                    printable += "\n";
                    break;
                default:
                    console.error("│    ".repeat(indentLevel) + "[DisplayCallGraph] Method " + g_methodName + "::Unhandled kind: @ line " + child.loc.start.line + " " + child.kind + " @ " + extractLocation(currentFile, child.loc));
                    break;
            }
        } catch (e) {
            console.error(e.stack);
            console.error("Error while parsing:" + extractLocation(currentFile, child.loc));
        }

    }

    return printable;
}

/**
 * from a given function, display all the functions that are called from it (recursively)
 * @param {method AST node} method
 */
function displayCallGraph(method, indentLevel = 0, doPrint=true) {

    if(!"body" in method || !"children" in method.body) {
        console.error("Uninteresting method: " + method.name.name);
    }
    let prefix = indentLevel === 0 ? "" : "│   ".repeat(indentLevel)+"└── ";
    g_methodName = method.name.name;
    let message = prefix +"Method " + g_methodName;
    if(doPrint) {
        console.log(message);
    }
    let res = dispatchChildren(method.body.children, indentLevel);
    if(doPrint) {
        console.log(res);
    }

    message += "\n" + res;
    return message;
}

function main() {

    // initialize a new parser instance
    const parser = new engine({
        // some options :
        parser: {
            extractDoc: true,
            php7: true,
        },
        ast: {
            withPositions: true,
        },
    });

    const phpFile = fs.readFileSync("./example.php");
    let parsedProgram = parser.parseCode(phpFile);
    let classes = getClassFromFile(parsedProgram);
    let matchingClasses = findClassByParentName(classes, "AbstractBlock");
    
    for(cls of matchingClasses) {
        g_currentCls = cls;
        let allMethods = enumerateMethods(cls);
        let filteredMethods = findMethodsByNumberOfArguments(allMethods, 0);
        for(method of filteredMethods) {
            displayCallGraph(method);
        }
    }
}


main();