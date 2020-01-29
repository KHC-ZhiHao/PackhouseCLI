#!/usr/bin/env node

const program = require('commander')

program
    .version('0.0.3')
    .command('read', 'Read main files, and create .packhouse.json file.')
    .command('generate-api-service', 'Generate api-service file.')
    .parse(process.argv)

if (program.args.length < 1) {
    program.outputHelp()
    process.exit()
}
