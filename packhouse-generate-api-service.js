const fs = require('fs-extra')
const target = `${__dirname}/api-service`

fs.copySync(target, './service')
