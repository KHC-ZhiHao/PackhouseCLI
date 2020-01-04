#!/usr/bin/env node

const program = require('commander')

program
    .version('0.0.1')
    .command('read', 'Read main files, and create .packhouse.json file.')
    .parse(process.argv)

if (program.args.length < 1) {
    program.outputHelp()
    process.exit()
}
