const fs = require('fs');
const Byte = require ("./Byte").Byte


class DbReader {
    constructor() {
    }

    binToJson() {
        let buf = this.readDbFile("heads")
        if (buf == null) {
            return
        }

        console.log("heads.db", buf.length)
        // console.log(buf.toString('hex')); // 输出十六进制字符串

        let headInfo = this.readHead(buf)
        this.saveJson(headInfo, null)
    }

    readDbFile(name) {
        let path = `./data/${name}.db`;
        try {
            const data = fs.readFileSync(path, null);
            let byte = new Byte(data)  // data 是一个 Buffer 对象
            return byte
        } catch (err) {
            console.error(`read db file failed:${path}`, err);
            return null
        }
    }

    saveJson(headInfo, body) {
        try {
            fs.mkdirSync('./data2', { recursive: true });
            let pathHead = `./data2/heads.json`;
            fs.writeFileSync(pathHead, JSON.stringify(headInfo))

            // for (let i = 0; i<bodyBytes.length; i++) {
            //     let pathBody = `./data/data${i}.db`
            //     fs.writeFileSync(pathBody , Buffer.from(bodyBytes[i].buffer))
            // }
        } catch (err) {
            console.error("save bin file failed", err);
        }
    }
     
    readHead(byte) {
        let headInfo = {}
        headInfo["date"] = byte.readUint16()
        headInfo["file_num"] = byte.readUint8()
        headInfo["table_num"] = byte.readVarInt()

        let tables = []
        for (let i = 0; i < headInfo["table_num"]; i++) {
            let name = byte.readUTFString()
            let headOffset = byte.readVarInt()
            let bodyOffset = byte.readVarInt()
            let bodyIdx = byte.readUint8()
            tables.push({name:name, headOffset:headOffset, bodyOffset:bodyOffset, bodyIdx:bodyIdx})
        }
        headInfo["tables"] = tables

        //head data
        let headTitles = []
        let headTypes = []
        for (let i = 0; i < headInfo["table_num"]; i++) {
            let headLen = byte.readUint8()
            let headTitle = []
            for (let i = 0; i< headLen; i++) {
                headTitle.push(byte.readUTFString())
            }
            headTitles.push(headTitle)

            let headType = []
            for (let i = 0; i< headLen; i++) {
                headType.push(byte.readUint8())
            }
            headTypes.push(headType)
        }

        headInfo["head_titles"] = headTitles
        headInfo["head_types"] = headTypes
        return headInfo
    }

    readBody() {

    }
}


module.exports = DbReader;