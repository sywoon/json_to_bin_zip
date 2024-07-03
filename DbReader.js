const fs = require("fs");
const Byte = require("./Byte").Byte;

class DbReader {
    constructor() {}

    binToJson() {
        let buf = this.readDbFile("heads");
        if (buf == null) {
            return;
        }

        console.log("read heads.db", buf.length);
        // console.log(buf.toString('hex')); // 输出十六进制字符串

        let headInfo = this.readHead(buf);
        let tableIdx = 0;
        let bodyInfos = [];
        for (let i = 0; i < headInfo["file_num"]; i++) {
            let bodyBuf = this.readDbFile(`data${i + 1}`);
            if (bodyBuf == null) {
                console.error("read body file failed", i, `data${i + 1}`);
                return;
            }
            console.log(`read data${i + 1}.db`, bodyBuf.length);
            let bodyInfo = this.readBody(tableIdx, i, bodyBuf, headInfo);
            tableIdx += bodyInfo["bodys"].length;
            bodyInfos.push(bodyInfo);
        }
        this.saveJson(headInfo, bodyInfos);
    }

    readDbFile(name) {
        let path = `./data/${name}.db`;
        try {
            const data = fs.readFileSync(path, null);
            let byte = new Byte(data); // data 是一个 Buffer 对象
            return byte;
        } catch (err) {
            console.error(`read db file failed:${path}`, err);
            return null;
        }
    }


    // headInfo: {version:20240301, file_num:2, table_num:999, tables:[{name,headOffset, bodyOffset}], 
    //  head_titles:["id", "name"], head_types:[0, 1]}
    // bodyInfos: [[version:20240301, bodys:[], doubleKeys:{}]]
    saveJson(headInfo, bodyInfos) {
        try {
            fs.mkdirSync("./data2", { recursive: true });
            let pathHead = `./data2/heads.json`;
            fs.writeFileSync(pathHead, JSON.stringify(headInfo));

            for (let i = 0; i < bodyInfos.length; i++) {
                let pathBody = `./data2/data${i + 1}.json`;
                console.log(pathBody, bodyInfos[i])
                fs.writeFileSync(pathBody, JSON.stringify(bodyInfos[i]));
            }
        } catch (err) {
            console.error("save bin file failed", err);
        }
    }

    // {version:20240301, file_num:2, table_num:999, tables:[{name,headOffset, bodyOffset}], 
    //  head_titles:["id", "name"], head_types:[0, 1]}
    readHead(byte) {
        let headInfo = {};
        headInfo["version"] = byte.readUint32();
        headInfo["file_num"] = byte.readUint8();
        headInfo["table_num"] = byte.readVarInt();

        let tables = [];
        for (let i = 0; i < headInfo["table_num"]; i++) {
            let name = byte.readUTFString();
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
                headTitle.push(byte.readUTFString());
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
        let bodyInfo = [];
        bodyInfo["version"] = byte.readUint32();

        let bodys = [];
        let tableNum = byte.readUint32();
        console.log("read tableNum", dataFileIdx, bodyInfo["version"], tableNum, tableStart);

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

    readOneTableBody(byte, tableInfo, head, headType) {
        if (tableInfo.bodyOffset != byte.pos) {
            console.log("bodyOffset error", name, tableInfo.bodyOffset, byte.pos);
            return null;
        }

        let name = byte.readUTFString();
        if (tableInfo.name != name) {
            console.log("table name error", name, name);
            return null;
        }

        let showlog = true;
        // showlog = name === "suit_suitDecompose";
        showlog && console.log("buff", byte.pos, byte.length);
        showlog && console.log("will read name", name, head, headType);

        let doubleKey = {};
        let doubleKeysNum = byte.readVarInt();
        for (let j = 0; j < doubleKeysNum; j++) {
            let key = byte.readUTFString();
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
                    row.push(byte.readUTFString());
                } else if (headType[k] == 2) {
                    row.push(JSON.parse(byte.readUTFString()));
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

        let body = { name: name, doubleKey: doubleKey, values: values };
        return body
    }
}

module.exports = DbReader;
