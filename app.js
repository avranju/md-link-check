"use strict";

const exec = require('child_process').exec;
const spawn = require('child_process').spawn;
const FS = require('fs');
const Walk = require('walk');
const Path = require('path');

const EXCLUDE_FOLDERS = [
  'build',
  'build_nodejs',
  'node_modules',
  '.git'
];

function checkUsage() {
  if(process.argv.length < 3) {
    console.error(`\nUsage:\n\tnode ${process.argv[1]} <<path to folder>>`);
    process.exit(1);
  }
  let stat = FS.statSync(process.argv[2]);
  if(stat.isDirectory() === false) {
    console.error(`The supplied path - ${process.argv[2]} - is not a directory.`);
    process.exit(1);
  }
}

function pathIncludesComponent(fullPath, componentsToCheck) {
  let components = fullPath.split(Path.sep);
  components = components.slice(0, components.length - 1);
  return components.some(comp => componentsToCheck.indexOf(comp) !== -1);
}

function shouldExcludeItem(root, stat) {
  let fullPath = Path.resolve(root, stat.name);

  // item should be excluded if:
  //  - it is a directory, or
  //  - path includes one of the folder we are not interested in
  //  - file is not an .md file
  return (
    stat.isDirectory() === true ||
    pathIncludesComponent(fullPath, EXCLUDE_FOLDERS) === true ||
    Path.extname(stat.name) !== '.md'
  );
}

function buildString(textNodes) {
  return textNodes.map(n => n.t === 'Space' ? ' ' : n.c).join('');
}

function verifyLink(context, link) {
  let basePath = Path.dirname(context.mdFilePath);

  // if link starts with '#' then we check in context.refs
  if(link.href.startsWith('#')) {
    if(context.refs.indexOf(link.href) === -1) {
      console.error(`${context.mdFilePath}: Found broken relative link: ${link.text} - ${link.href}`);
    }
  }

  // if the link starts with 'http' or 'https' then we assume it's valid
  else if(
      link.href.startsWith('http') === false &&
      link.href.startsWith('mailto') === false
    ) {
    // if this href resolves with basePath then it is valid
    let absolutePath = Path.resolve(basePath, link.href);
    if(FS.existsSync(absolutePath) === false) {
      console.error(`${context.mdFilePath}: Found broken relative link: ${link.text} - ${link.href}`);
    }
  }
}

function processLink(context, node) {
  // process a link
  if(node.t === 'Link') {
    verifyLink(context, {
      text: buildString(node.c[1]),
      href: node.c[2][0]
    });
  }
}

function processRawInline(context, node) {
  // process raw inline HTML markup
  if(
      node.t === 'RawInline'
      &&
      Array.isArray(node.c)
      &&
      node.c.length === 2
      &&
      typeof(node.c[0] === 'string')
      &&
      node.c[0] === 'html'
    ) {
    let html = node.c[1];

    // look for <a name="boo" /> tags
    let regex = /<\s*a\s+name\s*=\s*"([^"]*)"/g;
    let result = regex.exec(html);
    if(!!result && result.length > 0) {
      context.refs.push('#' + result[1]);
    }
  }
}

function visitNode(context, node, callback) {
  if(Array.isArray(node)) {
    node.forEach(n => visitNode(context, n, callback));
  } else {
    if(typeof(node) === 'object') {
      callback(context, node);

      if(Array.isArray(node.c)) {
        node.c.forEach(n => visitNode(context, n, callback));
      }
    }
  }
}

function cleanUpMDFile(mdFilePath, done) {
  let regex = /\*\*]\*\*/g;
  FS.readFile(mdFilePath, 'utf8', (err, data) => {
    if(!err) {
      data = data.replace(regex, '**]**\n');
    }
    done(err, data);
  });
}

function runPandoc(mdFilePath, markdown, done) {
  const pandoc = spawn('pandoc', ['-f', 'markdown', '-t', 'json']);
  pandoc.stdin.end(markdown, 'utf8');

  let json = '';
  pandoc.stdout.on('data', data => {
    json += Buffer.from(data).toString('utf8');
  });
  pandoc.stderr.on('data', data => {
    console.error(`ERROR: An error occurred while running pandoc on the markdown file ${mdFilePath}\n${data}`);
  });
  pandoc.on('close', code => {
    if(code !== 0) {
      done(new Error('Pandoc failed'), null);
    } else {
      done(null, json);
    }
  });
}

function verifyMDFile(mdFilePath, done) {
  cleanUpMDFile(mdFilePath, (err, data) => {
      if(!!err) {
        console.error(`ERROR: An error occurred while opening MD file: ${mdFilePath}\n${err}`);
      } else {
        runPandoc(mdFilePath, data, (err, json) => {
            if(!!err) {
              console.error(`ERROR: An error occurred while running pandoc on the file: ${mdFilePath}\n${err}`);
            } else {
              let ast = JSON.parse(json);
              let context = {
                mdFilePath: mdFilePath,
                refs: []
              };

              // first do a pass to build the 'ref' links
              visitNode(context, ast.blocks, processRawInline);

              // now verify the links
              visitNode(context, ast.blocks, processLink);
            }

            done();
        });
      }
  });
}

function main() {
  checkUsage();
  let rootPath = process.argv[2];
  let walker = Walk.walk(rootPath, {
    followLinks: false
  });

  walker.on('file', (root, fileStat, next) => {
    // check if we should exclude this item
    if(shouldExcludeItem(root, fileStat) === false) {
      let mdFilePath = Path.resolve(root, fileStat.name);
      console.log(`Processing ${mdFilePath}`);
      verifyMDFile(mdFilePath, next);
    }
    else {
      next();
    }
  });

  walker.on('errors', (root, nodeStatsArray, next) => {
    nodeStatsArray.forEach(function (n) {
      console.error("[ERROR] " + n.name)
      console.error(n.error.message || (n.error.code + ": " + n.error.path));
    });
    next();
  });

  walker.on('end', () => {
    console.log('Done walking');
  });
}

main();
