import fs from "fs";
import JSZip from "./libs/jszip.js";
import Byte from "./libs/Byte.js"


export class DbReader {
    constructor() {
        this.zipFile = null;
        this.tableCache = {};
    }

    readDb(dbPath) {
        console.log("dbPath", dbPath);
        let time = Date.now()
        try {
            let names = []
            let zip = new JSZip();
            let buffer = fs.readFileSync(`${dbPath}/data.db`);
            let zipFile = zip.load(buffer);
            this.zipFile = zipFile
            console.log("load zip time", Date.now() - time)
            time = Date.now()

            {
                let str = zipFile.file("all_names").asText();
                names = JSON.parse(str);
                console.log("load all names time", Date.now() - time)
            }

            // let tableInfo = this.unzipOneTable("activity");
            let info = this.getDbById("activity", 2);
            console.log("activity info", info);

            let lines = this.getDb("activity");
            console.log("lines all", Object.keys(lines).length);


            {
                let line = this.getUnique("skill_skill", 1003, 1)
                console.log("double_key skill_skill", line)
            }

            {
                let time = Date.now();
                for (let name of names) {
                    let lines = this.getDb(name);
                    // console.log("lines all", name, Object.keys(lines).length);
                }
                console.log("load all tables time", Date.now() - time);
            }

        } catch (err) {
            console.error("readDb failed", err.stack || err);
        }
    }    



    getDbById(name, id) {
        this.checkTableInfo(name);
        let line = this.readLineById(name, id);
        return line;
    }

    getUnique(name, ...args) {
        let id = this._getDoubleKeyId(name, ...args);
        if (!id) {
            console.error("getUnique failed", name, args);
            return null;
        }
        return this.getDbById(name, id);
    }

    _getDoubleKeyId(name, ...args) {
        let arrParams = Array.prototype.slice.call(args);
        let key = arrParams.join("_");

        let tableInfo = this.getTableInfo(name);
        let id = tableInfo["double_keys"][key];
        return id;
    }

    readLineById(name, id) {
        let tableInfo = this.tableCache[name];
        if (!tableInfo) {
            console.error("readLineById error", name, id);
            return null;
        }

        let ids = tableInfo["ids"];
        let offset = ids[id];
        let dataByte = tableInfo["data_byte"];

        dataByte.pos = offset;
        let row = null;
        try {
            let rowArr = JSON.parse(dataByte.readUTFString());
            let head_title = tableInfo["head_title"]
            row = {};  //转为map形式 方便业务使用
            for (let i = 0; i < head_title.length; i++) {
                row[head_title[i]] = rowArr[i]; 
            }
        } catch (err) {
            console.error("readLineByIdJson error", name, id, err.stack || err);
            return null;    
        }
        return row;
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

    getDb(name) {
        let time = Date.now();
        this.checkTableInfo(name);
        let tableInfo = this.tableCache[name];
        if (!tableInfo) {
            console.error("readDbAll error", name, id);
            return null;
        }

        let ids = tableInfo["ids"];
        let lines = {};
        for (let id of Object.keys(ids)) {
            let row = this.readLineById(name, id);
            lines[id] = row;
        }
        console.log("read db time:", name, Date.now() - time);
        return lines;
    }


    unzipOneTable(name) {
        let tableInfo = null;
        try {
            let time = Date.now();
            let u8 = this.zipFile.file(name).asArrayBuffer();
            let byte = new Byte(Buffer.from(u8));

            tableInfo = this.parseOneTableDb(byte);
            this.tableCache[name] = tableInfo;

            console.log("unzip one table time", name, Date.now() - time);
        } catch (err) {
            console.error("unzipOneTable failed", err.stack || err);
        }
        return tableInfo
    }

    
    parseOneTableDb(byte) {
        let headSize = byte.readUint32();
        let bodySize = byte.readUint32();
        let headBuffer = byte.readArrayBuffer(headSize);
        let bodyBuffer = byte.readArrayBuffer(bodySize);

        let tableInfo = {};
        try {
            let head = new Byte(headBuffer);
            let body = new Byte(bodyBuffer);
            let headInfo = head.readUTFString();
            let headTitle = head.readUTFString();
            let headType = head.readUTFString();
            let doubleKeys = head.readUTFString32();
            let ids = head.readUTFString32();

            tableInfo["head_info"] = JSON.parse(headInfo);
            tableInfo["head_title"] = JSON.parse(headTitle);
            tableInfo["head_type"] = JSON.parse(headType);
            tableInfo["double_keys"] = JSON.parse(doubleKeys); //可能是'null'
            tableInfo["ids"] = JSON.parse(ids);
            tableInfo["data_byte"] = body;
        } catch (err) {
            console.error("parseOneTableDb error", err.stack || err); 
        }
        return tableInfo;
    }

    readDbFile(name) {
        let path = `./data/${name}.db`;
        try {
            const data = fs.readFileSync(path, null); //得到Buffer
            let byte = new Byte(data); // data 是一个 Buffer 对象
            return byte;
        } catch (err) {
            console.error(`read db file failed:${path}`, err.stack || err);
            return null;
        }
    }

}


