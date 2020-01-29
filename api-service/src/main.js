const Step = require('packhouse/plugins/Step')
const Packhouse = require('packhouse')

module.exports = Packhouse.Main(() => ({
    plugins: [Step],
    groups: {
        'message': () => ({
            data: require('./groups/message')
        })
    },
    mergers: {
        'aws': () => ({
            data: require('./mergers/aws')
        })
    }
}))
