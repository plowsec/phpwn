// initialize the php parser factory class
const fs = require("fs");
const path = require("path");
const engine = require("php-parser");
//var logger = require('./logger')(module);

const currentFile = "./example.php";
let g_methodName = "";
let g_currentCls = null;

function findNodesWithKind(parsedProgram, kind) {

    let queue = [];
    let foundItems = [];

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

        if (currentChild.kind === kind) {
            //console.log(`Found ${kind}: ${currentChild}`);
            foundItems.push(currentChild);
        }
    }

    return foundItems;
}


function getClassFromFile(parsedProgram) {

  return findNodesWithKind(parsedProgram, "class");
}

function findClassByParentName(classes, expectedName, namespaces) {

    let foundCls = [];
    let shortName = "";
    if(expectedName.indexOf("\\")>-1) {
        console.log("Resolving namespace...");

        // get namespace from absolute path
        let expectedNamespace = expectedName.substring(0,expectedName.lastIndexOf("\\"));
        for(namespace of namespaces) {
            if(namespace.name === expectedNamespace) {
                shortName = expectedName.substring(expectedName.lastIndexOf("\\")+1);
            }
        }
    } else {
        shortName = expectedName;
    }

    for(cls of classes) {
        if("extends" in cls && cls.extends.name === shortName) {

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
   try {

       let lines = [];
       const allFileContents = fs.readFileSync(file, 'utf-8');
       allFileContents.split(/\r?\n/).forEach(line => {
           lines.push(line);
       });

       let start = loc.start.line;
       let end = loc.end.line;

       if (start === end) {
           let line = lines[start - 1];
           let extracted = line.substr(loc.start.column, loc.end.column);
           return extracted;
       } else {
           let result = "";
           for (let i = start; i < end; i++) {
               let line = lines[i - 1];

               if (i === 0) {
                   result += line.substr(loc.start.column);
               } else if (i === end) {
                   result += line.substr(0, loc.end.column);
               } else {
                   result += line;
               }
           }

           //console.log("Extracted result: " + result);
           return result;
       }
   }catch(e){
       return "Could not extract code location: " + e;
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

    if(indentLevel > 10) {
        return "Too deep";
    }
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

function findClassInFile(name, allParsedFiles, namespace) {

    for(let [filename, parsedProgram] of Object.entries(allParsedFiles)) {
        for(const cls of parsedProgram.classes) {
            if(cls.name.name === name) {
                console.log(`Found class ${name} in ${filename}`);
                let namespaces = getNamespaceFromFile(parsedProgram.parsedProgram);
                if(namespaces.some(n => (n.name === namespace.name || n.name.substring(1) === namespace.name) || n.name === namespace.name.substring(1))) {
                    console.log("This is the good one");

                    return allParsedFiles[filename];
                }
            }
        }
    }

    return null;
}

/**
 * follow "implements" and "extends" instruction to discover every class a given class inherits from
 */
function enumerateAllParentClasses(parsedProgram, cls, allParsedFiles) {

    let parentClasses = [];
    let currentCls = cls;
    let currentParent = "";
    let currentNamespace = "";
    while("extends" in currentCls && currentCls.extends !== null) {
        currentParent = currentCls.extends.name;
        if(currentParent.indexOf("\\") > -1) {
            currentNamespace = {"name":currentParent.substring(0, currentParent.lastIndexOf("\\"))};
            currentParent = currentParent.substring(currentParent.lastIndexOf("\\")+1);
        } else {
            currentNamespace = getNamespaceFromFile(parsedProgram)[0];
        }
        console.log("Current parent: " + currentParent);
        console.log("Current namespace: " + currentNamespace.name);
        currentCls = findClassInFile(currentParent, allParsedFiles, currentNamespace).classes[0];
        console.log("e");
    }

    return parentClasses;
}


function enumerateAllClassesWithParent(parentFullName, allParsedFiles) {

    let parentNamespace = {"name":""};
    let currentParent = parentFullName;
    let currentFqn = "";
    let foundClasses = [];

    if(parentFullName.indexOf("\\") > -1) {
        currentFqn = parentFullName;
        parentNamespace = {"name":currentParent.substring(0, currentParent.lastIndexOf("\\"))};
        currentParent = parentFullName.substring(parentFullName.lastIndexOf("\\")+1);
    } else {
        currentFqn = parentNamespace +"\\"+currentParent;
    }

    let foundChildren = false;
    let queue = [];
    let alreadyAnalyzed = [];

    do {
        foundChildren = false;
        for (let [filename, parsedProgram] of Object.entries(allParsedFiles)) {

            if(alreadyAnalyzed.includes(filename))
                continue;

            for (const cls of parsedProgram.classes) {

                if ("extends" in cls && cls.extends !== null) {
                    if(cls.extends.resolution === "fqn" && (cls.extends.name === currentFqn) || cls.extends.name.substring(1) === currentFqn || cls.extends.name === currentFqn.substring(1)) {
                        foundChildren = true;
                        console.log(`Adding ${cls.name.name} (${filename}) because it inherits from ${currentParent}`);
                        queue.push({"name": cls.name.name, "data": parsedProgram.parsedProgram});
                        foundClasses.push(cls);
                        alreadyAnalyzed.push(filename);
                    } else if(cls.extends.name === currentParent) {
                        foundChildren = true;
                        console.log(`Adding ${cls.name.name} (${filename}) because it inherits from ${currentParent}`);
                        queue.push({"name": cls.name.name, "data": parsedProgram.parsedProgram});
                        foundClasses.push(cls);
                        alreadyAnalyzed.push(filename);
                    }
                }
            }
        }

        if(queue.length > 0) {

            let item = queue.pop();
            currentParent = item.name;
            let namespaces = getNamespaceFromFile(item.data);
            parentNamespace = namespaces.length < 1 ? "" : namespaces[0];
            currentFqn = parentNamespace.name +"\\"+currentParent;
        }

    } while(foundChildren || queue.length > 0);

    return foundClasses;
}


function getNamespaceFromFile(parsedProgram) {

    let namespaces = findNodesWithKind(parsedProgram, "namespace");

    /*if(namespaces.length === 0) {
        console.error("Not namespace found");
        return null;
    } else if(namespaces.length === 1) {
        return namespaces[0];
    } else {
        throw("Too many namespaces, don't know how to handle that");
    }*/
    return namespaces;
}

function *walkSync(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            yield* walkSync(path.join(dir, file.name));
        } else {
            if(file.name.substring(file.name.lastIndexOf(".")) === ".php") {
                yield path.join(dir, file.name);
            }
        }
    }
}

function enumeratePHPFiles(folder) {

    let files = [...walkSync(folder)];
    return files;
}

function collectAllClasses(parser) {

    let files = enumeratePHPFiles(__dirname);
    let parsedFiles = {};
    for(let file of files) {
        try {
            const phpFile = fs.readFileSync(file);
            let parsedProgram = parser.parseCode(phpFile);
            let classes = getClassFromFile(parsedProgram);
            parsedFiles[file] = {
                "parsedProgram": parsedProgram,
                "classes": classes
            };
        } catch(e) {
            console.error("File " + file + " could not be parsed.");
        }
    }

    return parsedFiles;
}

function main() {

    // initialize a new parser instance
    const parser = new engine({
        // some options :
        parser: {
            extractDoc: true,
            php7: true,
            suppressErrors: true
        },
        ast: {
            withPositions: true,
        },
    });

    const phpFile = fs.readFileSync("./example.php");
    let parsedProgram = parser.parseCode(phpFile);
    let classes = getClassFromFile(parsedProgram);
    let namespaces = getNamespaceFromFile(parsedProgram);
    let matchingClasses = findClassByParentName(classes, "Magento\\Framework\\View\\Element\\AbstractBlock", namespaces);
    let allParsedFiles = collectAllClasses(parser);

    /*
    for(cls of matchingClasses) {
        g_currentCls = cls;
        let allMethods = enumerateMethods(cls);
        let filteredMethods = findMethodsByNumberOfArguments(allMethods, 0);
        for(method of filteredMethods) {
            displayCallGraph(method);

        }

        enumerateAllParentClasses(parsedProgram, cls, allParsedFiles);
    }*/

    //findClassInFile("AbstractBlock", allParsedFiles, getNamespaceFromFile(parsedProgram)[0]);
    //enumerateAllClassesWithParent("Magento\\Framework\\DataObject", allParsedFiles);
    let foundClasses = enumerateAllClassesWithParent("Magento\\Framework\\View\\Element\\AbstractBlock", allParsedFiles);
    for(let cls of foundClasses) {
        try{
            console.log("Exploring class " + cls.name.name);
            g_currentCls = cls;
            let allMethods = enumerateMethods(cls);
            let filteredMethods = findMethodsByNumberOfArguments(allMethods, 0);
            for(method of filteredMethods) {
                displayCallGraph(method);
            }
        } catch(e) {
            console.error("Error while exploring " + cls.name.name);
        }
        //enumerateAllParentClasses(parsedProgram, cls, allParsedFiles);
    }
}


main();