const fs = require("fs");
const Byte = require("./Byte").Byte;
const JSZipSync = require("./libs/jszip_sync");
const { table } = require("console");

class DbReaderSync {
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
            let zip = new JSZipSync();
            let buffer = fs.readFileSync("./data/data.zip");
            let zipFile = zip.load(buffer);
            console.log("load zip time", Date.now() - time);
            time = Date.now();

            this.zipFile = zipFile;
            {
                let str = zipFile.file("all_names").asText()
                names = JSON.parse(str);
                console.log("load names time", Date.now() - time);
            }

            // let tableInfo = this.unzipOneTable("activity");
            let info = this.getDbById("activity", 1);
            console.log("activity info", info);

            let lines = this.readDbAll("activity");
            console.log("lines all", Object.keys(lines));


            {
                let line = this.getUnique("beatGame_treasure", 1001, 3)
                console.log("double_key beatGame_treasure", line)
            }
        } catch (err) {
            console.error("binToJson error", err);
        }
        // this.saveJson(headInfo, bodyInfos);
    }

    unzipOneTable(name) {
        let time = Date.now();
        let u8 = this.zipFile.file(name).asArrayBuffer();
        let byte = new Byte(Buffer.from(u8));

        let tableInfo = this.parseOneTableDb(byte);
        this.tableCache[name] = tableInfo;

        console.log("unzip one table time", name, Date.now() - time);
        return tableInfo
    }

    getTableInfo(name) {
        let tableInfo = this.tableCache[name]
        if (!tableInfo) {
            tableInfo = this.unzipOneTable(name);
        }
        return tableInfo;
    }

    checkTableInfo(name) {
        this.getTableInfo(name);
    }

    //这里的实现有问题 由于jszip库是异步的 导致获取数据时不能立刻返回
    //解决：使用早期的2.6.1的同步版本 需要测试下性能
    getDbById(name, id) {
        this.checkTableInfo(name);
        let line = this.readLineById(name, id);
        return line;
    }

    _getDoubleKeyId(name, ...args) {
        let arrParams = Array.prototype.slice.call(args);
        let key = arrParams.join("_");

        let tableInfo = this.getTableInfo(name);
        let id = tableInfo["double_keys"][key];
        return id;
    }

    getUnique(name, ...args) {
        let id = this._getDoubleKeyId(name, ...args);
        if (!id) {
            console.error("getUnique failed", name, args);
            return null;
        }
        return this.getDbById(name, id);
    }

    readLineById(name, id) {
        // let time = Date.now();
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
        // console.log("read line time:", name, Date.now() - time);
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
}

module.exports = DbReaderSync;
