"use strict";

let FS = require('fs');
let Walk = require('walk');
let Path = require('path');
let MD = require('markdown').markdown;

const EXCLUDE_FOLDERS = [
  'build',
  'build_nodejs',
  '.git'
];

const LINK_TYPE_LINK = 0;
const LINK_TYPE_REF = 1;
const LINK_TYPE_REF_REF = 2;

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

function getReferences(tree) {
  if(tree.length > 1 && Array.isArray(tree[1]) === false && !!(tree[1]["references"])) {
    return tree[1].references;
  }

  return null;
}

function findLinks(item, links) {
  if(!!item) {
    if(item[0] === 'link') {
      links.push({
        type: LINK_TYPE_LINK,
        text: item[2],
        href: item[1].href
      });
    }
    else if(item[0] === 'link_ref') {
      links.push({
        type: LINK_TYPE_REF_REF,
        ref: item[1].ref 
      });
    }
    else {
      findLinks(
        Array.isArray(item[1]) ?
          item[1] :
          Array.isArray(item[2]) ?
            item[2] :
            null,
        links
      );
    }
  }
}

function verifyLinks(mdFilePath, links, references) {
  if(!!links && links.length > 0) {
    let basePath = Path.dirname(mdFilePath);

    links.forEach(link => {
      switch(link.type) {
        case LINK_TYPE_REF:
        case LINK_TYPE_LINK:
          // if the link starts with 'http' or 'https' then we assume it's valid
          if(
              link.href.startsWith('http') === false &&
              link.href.startsWith('mailto') === false
            ) {
            // if this href resolves with basePath then it is valid
            let absolutePath = Path.resolve(basePath, link.href);
            if(FS.existsSync(absolutePath) === false) {
              console.error(`${mdFilePath}: Found broken relative link: ${link.href}`);
            }
          }
          break;
        case LINK_TYPE_REF_REF:
          // check if this reference exists in 'references'
          if(!!references && !(references[link.ref])) {
            console.error(`${mdFilePath}: Found broken reference link: ${link.ref}`);
          }
          break;
      }
    });
  }
}

function verifyReferences(mdFilePath, references) {
  let links = [];
  for (var r in references) {
    if (references.hasOwnProperty(r)) {
      var element = references[r];
      links.push({
        type: LINK_TYPE_REF,
        text: '',
        href: element.href
      });
    }
  }

  verifyLinks(mdFilePath, links, references);
}

function verifyMDFile(mdFilePath, done) {
  FS.readFile(mdFilePath, 'utf8', (err, data) => {
    if(!!err) {
      console.error(`ERROR: An error occurred while opening MD file: ${mdFilePath}`);
    } else {
      let tree = MD.parse(data);
      // console.log(JSON.stringify(tree, null, 2));

      // verify that the links in the "references" section in the MD
      // file are good
      let references = getReferences(tree);
      if(!!references) {
        verifyReferences(mdFilePath, references);
      }

      let links = [];
      tree
        .filter(item => Array.isArray(item))
        .forEach(l => findLinks(l, links));

      verifyLinks(mdFilePath, links, references);
    }
    done();
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
