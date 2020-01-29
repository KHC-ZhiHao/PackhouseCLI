const group = {}

group.mergers = {
    dynamodb: 'aws@dynamodb'
}

group.install = function(group) {
    group.tableName = 'Messages'
}

// ===================
//
// Molds
//

group.molds = {}

// ===================
//
// Tools
//

group.tools = {
    put: {
        info: '建立訊息',
        request: ['string'],
        install({ group, include }) {
            include('put').tool('dynamodb/put', group.tableName)
        },
        handler(self, message) {
            let params = {
                createdAt: Date.now(),
                message
            }
            self.tool('put')
                .noGood(self.error)
                .action(params, self.success)
        }
    }
}

// ===================
//
// Lines
//

group.lines = {}

module.exports = group
