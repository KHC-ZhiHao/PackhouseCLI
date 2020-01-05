const fs = require('fs')
const path = require('path')
const watch = require('watch')
const program = require('commander')
const packhouse = require('packhouse')
const functionArguments = require('fn-args')

let $mainPath = null
let $packhouse = null

program
    .option('--abs', 'Use absolute path.')
    .option('--print', 'Print on console, not create file.')
    .option('--watch', 'RealTime compile to file.')
    .option('--ts', 'Run for typescript, need ts-node install.')
    .option('--main <file path>', 'Main file path, default is src/main.')
    .parse(process.argv)

function getRequirePath(funcString, merger) {
    if (merger) {
        let parent = (merger.match(/require\(.*?\)/i)[0] || '').replace('require', '').slice(2, -2).trim()
        let local = (funcString.match(/require\(.*?\)/i)[0] || '').replace('require', '').slice(2, -2).trim()
        return path.normalize($mainPath + '/' + parent + '/' + local)
    } else {
        let local = (funcString.match(/require\(.*?\)/i)[0] || '').replace('require', '').slice(2, -2).trim()
        return path.normalize($mainPath + '/' + local)
    }
}

function getGroups(groups) {
    let output = []
    for (let group in groups) {
        output.push({
            name: group,
            path: getRequirePath(groups[group].toString()) || null,
            ...groups[group](getDeepObject()).data
        })
    }
    return output
}

function getMergers(mergers) {
    let output = {}
    for (let sign in mergers) {
        let result = mergers[sign](getDeepObject()).data
        output[sign] = {
            molds: {},
            groups: []
        }
        output[sign].molds = result.molds || {}
        for (let name in result.groups) {
            output[sign].groups.push({
                name: name,
                path: getRequirePath(result.groups[name].toString(), mergers[sign].toString()) || null,
                ...result.groups[name](getDeepObject()).data
            })
        }
    }
    return output
}

function parseMold(molds) {
    if (molds == null) {
        return {}
    }
    let output = {}
    for (let [name, value] of Object.entries(molds)) {
        if (typeof value === 'function') {
            output[name] = value.toString()
        } else {
            output[name] = {}
            for (let [key, verfiy] of Object.entries(value)) {
                output[name][key] = {
                    required: verfiy[0],
                    types: verfiy[1],
                    default: typeof verfiy[3] === 'function' ? verfiy[3]() : verfiy[3]
                }
            }
        }
    }
    return output
}

function findArgs(func) {
    return functionArguments(func).slice(1)
}

function simulationInstall(install) {
    let included = {}
    let packLength = {}
    if (install == null) {
        return {
            included
        }
    }
    let toolHandler = name => {
        return {
            always: () => toolHandler(name),
            noGood: () => toolHandler(name),
            pack: (...args) => {
                packLength[name] += args.length
                return toolHandler(name)
            }
        }
    }
    let include = name => {
        packLength[name] = 0
        included[name] = {}
        return {
            line: (used, ...args) => {
                packLength[name] += args.length
                included[name].used = used
                included[name].type = 'line'
            },
            tool: (used) => {
                included[name].used = used
                included[name].type = 'tool'
                return toolHandler(name)
            }
        }
    }
    install({
        group: getDeepObject(),
        store: {},
        include,
        packhouse: $packhouse.packhouse,
        utils: packhouse.utils
    })
    return {
        included,
        packLength
    }
}

function parseTool(tools) {
    if (tools == null) {
        return {}
    }
    let output = {}
    for (let name in tools) {
        let value = tools[name]
        output[name] = {
            info: value.info || '',
            args: findArgs(value.handler),
            request: value.request || [],
            response: value.response,
            ...simulationInstall(value.install)
        }
    }
    return output
}

function parseLine(lines) {
    if (lines == null) {
        return {}
    }
    let output = {}
    for (let name in lines) {
        let line = lines[name]
        output[name] = {
            info: line.info || '',
            args: findArgs(line.input),
            request: line.request || [],
            response: line.response,
            layout: parseTool(line.layout),
            ...simulationInstall(line.install)
        }
    }
    return output
}

function parseGroup(group) {
    return {
        path: group.path,
        molds: parseMold(group.molds),
        tools: parseTool(group.tools),
        lines: parseLine(group.lines),
        mergers: group.mergers
    }
}

function getDeepObject() {
    let output = new Proxy({}, {
        get: () => output
    })
    return output
}

function compile(mainPath) {
    for (const path in require.cache) {
        if (path.endsWith('.js') || path.endsWith('.ts')) {
            delete require.cache[path]
        }
    }
    let packhouse = require(mainPath)
    if (packhouse.default) {
        $packhouse = packhouse.default(getDeepObject(), 'READ')
    } else {
        $packhouse = packhouse(getDeepObject(), 'READ')
    }
    let groups = getGroups($packhouse.groups)
    let mergers = getMergers($packhouse.mergers)
    let output = {
        groups: {},
        mergers: {}
    }

    for (let group of groups) {
        output.groups[group.name] = parseGroup(group)
    }

    for (let sign in mergers) {
        let merger = mergers[sign]
        output.mergers[sign] = {
            molds: parseMold(merger.molds),
            groups: {}
        }
        for (let group of merger.groups) {
            output.mergers[sign].groups[group.name] = parseGroup(group)
        }
    }
    return output
}

function writeFile(root, mainPath) {
    try {
        fs.writeFileSync(root + '/.packhouse/dist.json', JSON.stringify(compile(mainPath), null, 4))
    } catch (error) {
        console.log(error)
    }
}

function main(root, mainPath) {
    $mainPath = path.dirname(mainPath)
    if (program.print) {
        console.log(JSON.stringify(compile(mainPath), null, 4))
        return null
    }
    if (fs.existsSync(root + '/.packhouse') === false) {
        fs.mkdirSync(root + '/.packhouse')
    }
    writeFile(root, mainPath)
    if (program.watch) {
        console.log('Packhouse read watching...')
        watch.watchTree(root, { ignoreDirectoryPattern: /node_modules|.packhouse/ }, (file, curr, prev) => {
            if (typeof file === 'string') {
                console.log('File change, compileing...')
                writeFile(root, mainPath)
                console.log('Compiled.')
            }
        })
    }
}

if (program.ts) {
    require('ts-node').register({
        skipIgnore: true
    })
}
if (program.abs) {
    main('', path.normalize(program.main || './src/main'))
} else {
    main(process.cwd(), path.normalize(process.cwd() + '/' + (program.main || './src/main')))
}
