"use strict";

const exec = require('child_process').exec;

function checkUsage() {
  if(process.argv.length < 3) {
    console.error(`\nUsage:\n\tnode ${process.argv[1]} <<path to MD file>>`);
    process.exit(1);
  }
}

function buildString(textNodes) {
  return textNodes.map(n => n.t === 'Space' ? ' ' : n.c).join('');
}

function printLink(linkNode) {
  console.log(`${buildString(linkNode.c[1])} : ${linkNode.c[2][0]}`);
}

let types = {};
function visitNode(node) {
  if(Array.isArray(node)) {
    node.forEach(visitNode);
  } else {
    if(typeof(node) === 'object') {
      if(!!(types[node.t])) {
        ++(types[node.t]);
      } else {
        types[node.t] = 1;
      }

      if(node.t === 'Link') {
        printLink(node);
      }

      if(Array.isArray(node.c)) {
        node.c.forEach(visitNode);
      }
    }
  }
}

function main() {
  checkUsage();
  exec(`pandoc -f markdown ${process.argv[2]} -t json`, (err, stdout, stderr) => {
    if(!err) {
      let ast = JSON.parse(stdout);
      visitNode(ast.blocks);
      console.log(`Type Stats:\n${JSON.stringify(types, null, 2)}`);
    } else {
      console.error(`ERROR: ${err}`);
    }
  });
}

main();
