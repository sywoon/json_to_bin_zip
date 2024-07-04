const fs = require("fs");
const Byte = require("./Byte").Byte;

class DbReader {
    constructor() {
        this.strByte = new Byte();
        this.strBuffer = {};
    }

    getBufferString(offset) {
        if (this.strBuffer[offset] != null) {
            return this.strBuffer[offset];
        }
        this.strByte.pos = offset;
        let str = this.strByte.readUTFString();
        this.strBuffer[offset] = str;
        return str;
    }

    getStrFromByte(byte, str) {
        let offset = byte.readVarInt();
        return this.getBufferString(offset);
    }

    binToJson() {
        let strByte = this.readDbFile("strings");
        if (strByte == null)
            return;
        this.strByte = strByte;

        let headByte = this.readDbFile("heads");
        if (headByte == null) {
            return;
        }

        console.log("read heads.db", headByte.length);
        // console.log(buf.toString('hex')); // 输出十六进制字符串

        let headInfo = this.readHead(headByte);
        let tableIdx = 0;
        let bodyInfos = [];
        for (let i = 0; i < headInfo["file_num"]; i++) {
            let dataByte = this.readDbFile(`data${i + 1}`);
            if (dataByte == null) {
                console.error("read body file failed", i, `data${i + 1}`);
                return;
            }
            console.log(`read data${i + 1}.db`, dataByte.length);
            // {version:20240301, bodys:[{name, doubleKey, values}]}
            let bodyInfo = this.readBody(tableIdx, i, dataByte, headInfo);
            if (bodyInfo == null) {
                return;
            }
            tableIdx += bodyInfo["bodys"].length;
            bodyInfos.push(bodyInfo);
        }
        this.saveJson(headInfo, bodyInfos);
    }

    readDbFile(name) {
        let path = `./data/${name}.db`;
        try {
            const data = fs.readFileSync(path, null);  //得到Buffer
            let byte = new Byte(data); // data 是一个 Buffer 对象
            return byte;
        } catch (err) {
            console.error(`read db file failed:${path}`, err);
            return null;
        }
    }


    // headInfo: {version:20240301, file_num:2, table_num:999, tables:[{name,headOffset, bodyOffset}], 
    //  head_titles:["id", "name"], head_types:[0, 1]}
    // bodyInfos: [[version:20240301, bodys:[]]]
    saveJson(headInfo, bodyInfos) {
        function replacer(key, value) {
            if (typeof value === 'function' || typeof value === 'undefined') {
                console.error("json.stringify error", key, value)
                return null;
            }
            return value;
        }

        try {
            fs.mkdirSync("./data2", { recursive: true });

            let pathStrBuffer = `./data2/strings.json`;
            fs.writeFileSync(pathStrBuffer, JSON.stringify(this.strBuffer, replacer));

            let pathHead = `./data2/heads.json`;
            fs.writeFileSync(pathHead, JSON.stringify(headInfo, replacer));

            for (let i = 0; i < bodyInfos.length; i++) {
                let pathBody = `./data2/data${i + 1}.json`;
                try {
                    let txt = JSON.stringify(bodyInfos[i], replacer)
                    fs.writeFileSync(pathBody, txt);
                } catch (err) {
                    console.error("save body file failed", pathBody, err);
                }
            }
        } catch (err) {
            console.error("save bin file failed", err);
        }
    }

    // {version:20240301, file_num:2, table_num:999, tables:[{name, headOffset, bodyOffset, dataFileIdx}], 
    //  head_titles:["id", "name"], head_types:[0, 1]}
    readHead(byte) {
        let headInfo = {};
        headInfo["version"] = byte.readUint32();
        headInfo["file_num"] = byte.readUint8();
        headInfo["table_num"] = byte.readVarInt();

        let tables = [];
        for (let i = 0; i < headInfo["table_num"]; i++) {
            let name = this.getStrFromByte(byte);
            let headOffset = byte.readVarInt();
            let bodyOffset = byte.readVarInt();
            let dataFileIdx = byte.readUint8();
            tables.push({ name: name, headOffset: headOffset, bodyOffset: bodyOffset, dataFileIdx: dataFileIdx });
        }
        headInfo["tables"] = tables;

        //head data
        let headTitles = [];
        let headTypes = [];
        for (let i = 0; i < headInfo["table_num"]; i++) {
            let columnLen = byte.readUint8();
            let headTitle = [];
            for (let i = 0; i < columnLen; i++) {
                headTitle.push(this.getStrFromByte(byte));
            }
            headTitles.push(headTitle);

            let headType = [];
            for (let i = 0; i < columnLen; i++) {
                headType.push(byte.readUint8());
            }
            headTypes.push(headType);
        }

        headInfo["head_titles"] = headTitles;
        headInfo["head_types"] = headTypes;
        return headInfo;
    }

    // {version:20240301, bodys:[{name, doubleKey, values}]}
    readBody(tableStart, dataFileIdx, byte, headInfo) {
        let bodyInfo = {};
        bodyInfo["version"] = byte.readUint32();

        let bodys = [];
        let tableNum = byte.readVarInt();

        for (let i = 0; i < tableNum; i++) {
            let tableIdx = i + tableStart;
            let tableInfo = headInfo["tables"][tableIdx]; //{"name":"activity","headOffset":0,"bodyOffset":5,"dataFileIdx":0},
            let head = headInfo["head_titles"][tableIdx]; //["id","name","fightItem","reward"
            let headType = headInfo["head_types"][tableIdx]; //[0,1,0,0,0,

            let body = this.readOneTableBody(byte, tableInfo, head, headType);
            if (body == null) {
                console.error("readOneTableBody failed", tableInfo, head, headType);
                break
            }
            bodys.push(body);
        }
        bodyInfo["bodys"] = bodys;
        return bodyInfo;
    }

    // { name: name, doubleKey: doubleKey, values: values }
    readOneTableBody(byte, tableInfo, head, headType) {
        if (tableInfo.bodyOffset != byte.pos) {
            console.error("bodyOffset error", name, tableInfo.bodyOffset, byte.pos);
            return null;
        }

        let name = this.getStrFromByte(byte);
        if (tableInfo.name != name) {
            console.error("table name error", name, name);
            return null;
        }

        let doubleKey = {};
        let doubleKeysNum = byte.readVarInt();
        for (let j = 0; j < doubleKeysNum; j++) {
            let key = this.getStrFromByte(byte);
            let id = byte.readVarInt();
            doubleKey[key] = id;
        }

        let bodyLen = byte.readVarInt();
        let values = [];
        for (let j = 0; j < bodyLen; j++) {
            let row = [];
            for (let k = 0; k < head.length; k++) {
                if (headType[k] == 0) {
                    row.push(byte.readVarInt());
                } else if (headType[k] == 1) {
                    row.push(this.getStrFromByte(byte));
                } else if (headType[k] == 2) {
                    let txt = this.getStrFromByte(byte)
                    row.push(JSON.parse(txt));
                } else if (headType[k] == 3) {
                    row.push(byte.readFloat32());
                } else if (headType[k] == 4) {
                    row.push(byte.readAny());
                } else {
                    console.error("readOneTableBody error", name, headType[k]);
                }
            }
            values.push(row);
        }

        let body = { name: name, values: values };
        if (doubleKeysNum > 0) {
            body["doubleKey"] = doubleKey
        }
        return body
    }
}

module.exports = DbReader;
