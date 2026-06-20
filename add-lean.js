const { Project, SyntaxKind } = require('ts-morph');

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

const sourceFiles = project.getSourceFiles("app/api/**/*.ts");

let modifiedFiles = 0;

sourceFiles.forEach(sourceFile => {
  let fileModified = false;

  // Find GET functions
  const getFunctions = sourceFile.getFunctions().filter(f => f.getName() === 'GET');
  
  getFunctions.forEach(getFunc => {
    // Traverse all descendants in the GET function
    getFunc.forEachDescendant(node => {
      if (node.getKind() === SyntaxKind.CallExpression) {
        const expression = node.getExpression();
        if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
          const propAccess = expression;
          const methodName = propAccess.getName();
          
          if (methodName === 'find' || methodName === 'findOne') {
            // Found a find() or findOne() call.
            // Check if .lean() is already called on this chain
            // We traverse up the CallExpressions to see if lean() is called
            let isLeanCalled = false;
            let current = node;
            let highestCallExpr = node;
            
            while (current.getParent() && current.getParent().getKind() === SyntaxKind.PropertyAccessExpression) {
              const parentPropAccess = current.getParent();
              const nextMethodName = parentPropAccess.getName();
              
              if (['lean', 'countDocuments', 'count', 'exec'].includes(nextMethodName)) {
                isLeanCalled = true;
                break;
              }
              
              if (parentPropAccess.getParent() && parentPropAccess.getParent().getKind() === SyntaxKind.CallExpression) {
                current = parentPropAccess.getParent();
                highestCallExpr = current;
              } else {
                break;
              }
            }

            if (!isLeanCalled) {
              // Add .lean() to the highest CallExpression in the chain
              // Example: Model.find().sort() -> Model.find().sort().lean()
              // Wait, highestCallExpr text might be "await Model.find()" which is an AwaitExpression!
              // But we only traced up PropertyAccessExpression -> CallExpression.
              const newText = highestCallExpr.getText() + '.lean()';
              highestCallExpr.replaceWithText(newText);
              fileModified = true;
            }
          }
        }
      }
    });
  });

  if (fileModified) {
    sourceFile.saveSync();
    modifiedFiles++;
    console.log(`Updated ${sourceFile.getFilePath()}`);
  }
});

console.log(`Modified ${modifiedFiles} files.`);
