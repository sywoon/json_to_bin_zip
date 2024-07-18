import Byte from "./libs/Byte.js";
import JSZip from "./libs/jszip.js";
import fs from "fs";



export class DbWriter {
    constructor() {
    }

    jsonToBin(dbJsonpath) {
        console.log("dbPath", dbJsonpath);
        this._dbJsonpath = dbJsonpath;

        let jsonDataAll = this.readJsonData();
        let heads = jsonDataAll["heads"];
        let tablesInfo = [];
        let tableIdx = 0;
        for (let i = 0; i < heads["file_num"]; i++) {
            let name = `data${i + 1}`;
            let bodyData = jsonDataAll[name];
            this.bodyToBin(tableIdx, i, heads, bodyData, tablesInfo)
            tableIdx += bodyData.values.length;
        }
        this.saveBinFile(tablesInfo);
    }

    saveBinFile(tablesInfo) {
        try {
            let names = [];
            let zip = new JSZip();
            for (let tableInfo of tablesInfo) {
                let name = tableInfo["name"];
                let byteTable = tableInfo["byteTable"];
                names.push(name);
                zip.file(name, byteTable.buffer);
            }
            zip.file("all_names", JSON.stringify(names));

            let content = zip.generate({
                type: "arraybuffer",
                compression: "DEFLATE",
                compressionOptions: {
                    level: 7,  // 压缩等级1~9  1压缩速度最快，9最优压缩方式
                }
            });

            if (!fs.existsSync("./data")) {
                fs.mkdirSync("./data")
            }
            fs.writeFileSync("./data/data.db", Buffer.from(content))
        } catch (err) {
            console.error("save bin file failed", err.stack || err);
        }
    }

    bodyToBin(tableStart, dataFileIdx, heads, bodyData, tablesInfo) {
        //commson中有 es6中没有？
        //assert(heads["tables"].length >= bodyData.values.length, "body data error");

        for (let i = 0; i < bodyData.values.length; i++) {
            let tableIdx = i + tableStart;
            let name = heads["tables"][tableIdx];
            let head_title = heads["heads"][tableIdx]
            let head_type = heads["heads_type"][tableIdx]
            let double_keys = heads["double_keys"][name]
            let body = bodyData.values[i];

            let tableInfo = this.parseOneTableByJson(name, head_title, head_type, double_keys, body);
            let byteTable = this.oneTableBodyToBin(tableInfo);
            tablesInfo.push({ tableInfo: tableInfo, byteTable: byteTable, tableIdx: tableIdx, name: name });
        }
    }

    parseOneTableByJson(name, head_title, head_type, double_keys, body) {
        let tableInfo = {};
        let headInfo = {};
        headInfo["name"] = name;
        headInfo["row_count"] = body.length;
        tableInfo["head_info"] = headInfo;

        let ids = {};
        tableInfo["ids"] = ids;
        tableInfo["head_title"] = head_title;
        tableInfo["head_type"] = head_type;
        tableInfo["double_keys"] = double_keys == null ? null : double_keys;

        let dataByte = new Byte();
        tableInfo["data_byte"] = dataByte;

        for (let j = 0; j < body.length; j++) {
            let line = body[j];
            let id = line[0];
            ids[id] = dataByte.pos;
            let lineStr = JSON.stringify(line);
            dataByte.writeUTFString(lineStr);
        }
        return tableInfo;
    }


    oneTableBodyToBin(tableInfo) {
        let byteHead = new Byte();
        byteHead.writeUTFString(JSON.stringify(tableInfo["head_info"])); //tableInfo
        byteHead.writeUTFString(JSON.stringify(tableInfo["head_title"]));
        byteHead.writeUTFString(JSON.stringify(tableInfo["head_type"]));
        byteHead.writeUTFString32(tableInfo["double_keys"] ? JSON.stringify(tableInfo["double_keys"]) : "null");
        byteHead.writeUTFString32(JSON.stringify(tableInfo["ids"]));

        let byteBody = tableInfo["data_byte"];
        let byteTable = new Byte();

        byteTable.writeUint32(byteHead.length);
        byteTable.writeUint32(byteBody.length);
        byteTable.writeArrayBuffer(byteHead.buffer);
        byteTable.writeArrayBuffer(byteBody.buffer);
        return byteTable;
    }



    readJsonData() {
        let all = {}
        let heads = this.readJsonByName("heads");
        all["heads"] = heads;

        for (let i = 0; i < heads["file_num"]; i++) {
            let name = `data${i + 1}`;
            let bodyData = this.readJsonByName(name);
            all[name] = bodyData;
        }
        return all;
    }

    readJsonByName(name) {
        let path = `${this._dbJsonpath}/${name}.json`
        let data = null;
        try {
            const db = fs.readFileSync(path, "utf-8");
            data = JSON.parse(db);
        } catch (error) {
            console.log("readJson failed:${path}", error && error.stack);
        }
        return data;
    }

}

