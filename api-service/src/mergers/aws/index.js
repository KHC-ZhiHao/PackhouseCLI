module.exports = {
    groups: {
        dynamodb() {
            return {
                data: require('./dynamodb')
            }
        }
    }
}
