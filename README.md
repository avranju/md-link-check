md-link-check
=============

This tool scans a folder for markdown files by looking at files that have the
extension **.md** and parses the file for relative links that are broken and
prints them to the error stream on the console. This program uses the tool
[Pandoc](http://pandoc.org/) for converting a markdown file into an abstract
syntax tree and then walks the tree looking for broken links.

Pre-requisites
--------------
1. Install [Pandoc](http://pandoc.org/installing.html)
2. Install [Node.js](https://nodejs.org/)
3. Install [Yarn](https://yarnpkg.com/en/docs/install)

How to run
----------
1. Clone the repository
2. Open a command prompt/terminal and navigate to the folder where you cloned
   this repository
3. Run `yarn install`
4. Run `node app.js /path/to/folder 2> output.txt`
