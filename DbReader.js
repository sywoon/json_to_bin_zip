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
        let tableIdx = 0
        let bodyInfos = []
        for (let i = 0; i< headInfo["file_num"]; i++) {
            let bodyBuf = this.readDbFile(`data${i+1}`)
            if (bodyBuf == null) {
                return
            }
            console.log(`data${i+1}.db`, bodyBuf.length)
            let bodyInfo = this.readBody(tableIdx, i, bodyBuf, headInfo)
            tableIdx += bodyInfo["bodys"].length
            bodyInfos.push(bodyInfo)
        }
        this.saveJson(headInfo, bodyInfos)
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

    saveJson(headInfo, bodyInfos) {
        try {
            fs.mkdirSync('./data2', { recursive: true });
            let pathHead = `./data2/heads.json`;
            fs.writeFileSync(pathHead, JSON.stringify(headInfo))

            for (let i = 0; i<bodyInfos.length; i++) {
                let pathBody = `./data2/data${i+1}.json`
                fs.writeFileSync(pathBody, JSON.stringify(bodyInfos[i]))
            }
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
            let dataFileIdx = byte.readUint8()
            tables.push({name:name, headOffset:headOffset, bodyOffset:bodyOffset, dataFileIdx:dataFileIdx})
        }
        headInfo["tables"] = tables

        //head data
        let headTitles = []
        let headTypes = []
        for (let i = 0; i < headInfo["table_num"]; i++) {
            let columnLen = byte.readUint8()
            let headTitle = []
            for (let i = 0; i< columnLen; i++) {
                headTitle.push(byte.readUTFString())
            }
            headTitles.push(headTitle)

            let headType = []
            for (let i = 0; i< columnLen; i++) {
                headType.push(byte.readUint8())
            }
            headTypes.push(headType)
        }

        headInfo["head_titles"] = headTitles
        headInfo["head_types"] = headTypes
        return headInfo
    }

    readBody(tableStart, dataFileIdx, byte, headInfo) {
        let bodyInfo = []
        bodyInfo["date"] = byte.readUint16()

        let bodys = []
        let tableNum = byte.readVarInt()
        console.log("read tableNum", tableNum, tableStart)

        let showlog = false
        let doubleKeys = {}
        for (let i =0; i<tableNum; i++) {
            let tableIdx = i + tableStart;
            let table = headInfo["tables"][tableIdx]  //{"name":"activity","headOffset":0,"bodyOffset":5,"dataFileIdx":0},
            let head = headInfo["head_titles"][tableIdx]  //["id","name","fightItem","reward"
            let headType = headInfo["head_types"][tableIdx]  //[0,1,0,0,0,

            showlog && console.log("buff", byte.pos, byte.length)
            showlog && console.log("will read name", table.name, head, headType)

            let name = byte.readUTFString()
            showlog |= name === "suit_suitDecompose"
            showlog && console.log("name", table.name, name)
            if (table.name != name) {
                console.log("table name error", table.name, name)
                break;
            }

            let doubleKey = {}
            let doubleKeysNum = byte.readInt16()
            for (let j = 0; j<doubleKeysNum; j++) {
                let key = byte.readUTFString()
                let id = byte.readInt16()
                doubleKey[key] = id
            }
            doubleKeys[name] = doubleKey
            showlog && console.log("doubleKey", Object.keys(doubleKey).length)

            let bodyLen = byte.readInt16()
            showlog && console.log("bodylen", bodyLen)
            let body = []
            for (let j = 0; j<bodyLen; j++) {
                let row = []
                for (let k = 0; k<head.length; k++) {
                    if (headType[k] == 0) {
                        row.push(byte.readVarInt())
                    } else if (headType[k] == 1) {
                        row.push(byte.readUTFString())
                    } else if (headType[k] == 2) {
                        row.push(JSON.parse(byte.readUTFString()))
                    } else if (headType[k] == 3) {
                        row.push(byte.readFloat32())
                    } else if (headType[k] == 4) {
                        row.push(byte.readAny())
                    }
                }
                body.push(row)
            }
            bodys.push(body)
        }
        bodyInfo["bodys"] = bodys
        bodyInfo["doubleKeys"] = doubleKeys
        return bodyInfo
    }
}


module.exports = DbReader;