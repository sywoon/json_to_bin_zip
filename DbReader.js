const fs = require('fs');
const Byte = require ("./Byte").Byte


class DbReader {
    constructor() {
    }

    binToJson(file) {
        let path = `./data/${file}.db`;

        try {
            const data = fs.readFileSync(path, null);
            let byte = new Byte(data)  // data 是一个 Buffer 对象
            console.log(data);
            console.log(data.toString('hex')); // 输出十六进制字符串
        } catch (err) {
            console.error(err);
        }

    }
}


module.exports = DbReader;