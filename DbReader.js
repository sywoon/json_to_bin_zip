const fs = require("fs");
const Byte = require("./Byte").Byte;
const JSZipAsync = require("./libs/jszip_async");

class DbReader {
    constructor() {
        this.strBuffer = {};
        this.zipFile = null;
        this.tableCache = {};
    }

    getBufferString(offset, strByte) {
        if (this.strBuffer[offset] != null) { //可以优化 只在读取某个表过程中才保存
            return this.strBuffer[offset];
        }
        strByte.pos = offset;
        let str = strByte.readUTFString();
        this.strBuffer[offset] = str;
        return str;
    }

    getStrFromByte(byte, strByte) {
        let offset = byte.readVarInt();
        return this.getBufferString(offset, strByte);
    }

    binToJson() {
        let time = Date.now();
        try {
            let names = [];
            let zip = new JSZipAsync();
            let buffer = fs.readFileSync("./data/data.zip");
            zip.loadAsync(buffer).then((zipFile) => {
                console.log("load zip time", Date.now() - time);
                time = Date.now();

                this.zipFile = zipFile;
                zipFile
                    .file("all_names")
                    .async("string")
                    .then((str) => {
                        names = JSON.parse(str);
                        console.log("load names time", Date.now() - time);
                    });

                this.unzipOneTable("activity", (tableInfo)=>{
                    let info = this.getDbById("activity", 1);
                })
            });
        } catch (error) {
            console.error("read zip error", error);
        }

        // this.saveJson(headInfo, bodyInfos);
    }

    unzipOneTable(name, cbk) {
        let time = Date.now();
        this.zipFile
        .file(name)
        .async("arraybuffer")
        .then((u8) => {
            let byte = new Byte(Buffer.from(u8));
            let tableInfo = this.parseOneTableDb(byte);
            this.tableCache[name] = tableInfo;
            console.log("unzip one table time", name, Date.now() - time);
            cbk && cbk(tableInfo);
        });
    }

    //这里的实现有问题 由于jszip库是异步的 导致获取数据时不能立刻返回
    //解决：使用早期的2.6.1的同步版本 需要测试下性能
    getDbById(name, id) {
        let parseDbCall = null;
        if (this.tableCache[name]) {
            this.unzipOneTable(name, (tableInfo)=>{
                let line = this.readLineById(name, id);
                console.log("line", line);
                let lines = this.readDbAll(name);
                console.log("lines", lines);
            })
            return null;
        } else {
            let line = this.readLineById(name, id);
            console.log("line2", line);
            let lines = this.readDbAll(name);
            console.log("lines2", lines);
            return line;
        }
    }

    readLineById(name, id) {
        let time = Date.now();
        let tableInfo = this.tableCache[name];
        if (!tableInfo) {
            console.error("readLineById error", name, id);
            return null;
        }

        let ids = tableInfo["ids"];
        let offset = ids[id];
        let dataByte = tableInfo["data_byte"];
        let strBlock = tableInfo["string_block"];

        dataByte.pos = offset;
        let row = {};
        for (let i = 0; i < tableInfo["head_title"].length; i++) {
            let type = tableInfo["head_type"][i];
            let value = null;
            if (type == 0) {
                value = dataByte.readVarInt();
            } else if (type == 1) {
                value = this.getStrFromByte(dataByte, strBlock);
            } else if (type == 2) {
                let txt = this.getStrFromByte(dataByte, strBlock);
                value = JSON.parse(txt);
            } else if (type == 3) {
                value = dataByte.readFloat32();
            } else if (type == 4) {
                value = dataByte.readAny();
            } else {
                console.error("readOneTableBody error", name, type);
            }
            row[tableInfo["head_title"][i]] = value; 
        }
        console.log("read line time:", name, Date.now() - time);
        return row;
    }

    readDbAll(name) {
        let time = Date.now();
        let tableInfo = this.tableCache[name];
        if (!tableInfo) {
            console.error("readDbAll error", name, id);
            return null;
        }

        let ids = tableInfo["ids"];
        let lines = {};
        for (let id in ids) {
            let row = this.readLineById(name, id);
            lines[id] = row;
        }
        console.log("read db all time:", name, Date.now() - time);
        return lines;
    }

    parseOneTableDb(byte) {
        let headSize = byte.readUint32();
        let bodySize = byte.readUint32();
        let strBlockLen = byte.readUint32();
        let headBuffer = byte.readArrayBuffer(headSize);
        let bodyBuffer = byte.readArrayBuffer(bodySize);
        let strBlockBuffer = byte.readArrayBuffer(strBlockLen);

        let head = new Byte(headBuffer);
        let body = new Byte(bodyBuffer);
        let strBlock = new Byte(strBlockBuffer);
        let headInfo = head.readUTFString();
        let headTitle = head.readUTFString();
        let headType = head.readUTFString();
        let doubleKeys = head.readUTFString();
        let ids = head.readUTFString();

        let tableInfo = {};
        tableInfo["head_info"] = JSON.parse(headInfo);
        tableInfo["head_title"] = JSON.parse(headTitle);
        tableInfo["head_type"] = JSON.parse(headType);
        tableInfo["double_keys"] = JSON.parse(doubleKeys); //可能是'null'
        tableInfo["ids"] = JSON.parse(ids);
        tableInfo["data_byte"] = body;
        tableInfo["string_block"] = strBlock;
        return tableInfo;
    }

    readDbFile(name) {
        let path = `./data/${name}.db`;
        try {
            const data = fs.readFileSync(path, null); //得到Buffer
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
            if (typeof value === "function" || typeof value === "undefined") {
                console.error("json.stringify error", key, value);
                return null;
            }
            return value;
        }

        try {
            fs.mkdirSync("./data2", { recursive: true });

            let pathStrBuffer = `./data2/strings.json`;
            fs.writeFileSync(pathStrBuffer, JSON.stringify(Object.values(this.strBuffer)));

            let pathHead = `./data2/heads.json`;
            fs.writeFileSync(pathHead, JSON.stringify(headInfo, replacer));

            for (let i = 0; i < bodyInfos.length; i++) {
                let pathBody = `./data2/data${i + 1}.json`;
                try {
                    let txt = JSON.stringify(bodyInfos[i], replacer);
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
                break;
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
                    let txt = this.getStrFromByte(byte);
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
            body["doubleKey"] = doubleKey;
        }
        return body;
    }
}

module.exports = DbReader;
