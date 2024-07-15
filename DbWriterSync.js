const { assert } = require("console");
const fs = require("fs");
const Byte = require("./Byte").Byte;
const JSZipSync = require("./libs/jszip_sync");

//保存数据的格式
const data_type = 2  //1:binary 2:json

class StringBlock {
    constructor() {
        this.strByte = new Byte();
        this.strOffset = {};
        this.strSameInfo = {};
    }

    pushString(str, desc) {
        if (this.strOffset[str]) {
            this.strSameInfo[str] = this.strSameInfo[str] || { count: 1, str: str, desc: [] };
            this.strSameInfo[str]["count"]++;
            if (this.strSameInfo[str]["desc"].indexOf(desc) == -1) {
                this.strSameInfo[str]["desc"].push(desc);
            }
            return this.strOffset[str];
        }

        this.strOffset[str] = this.strByte.pos;
        this.strByte.writeUTFString(str);
        return this.strOffset[str];
    }

    writeStrToByte(byte, str, desc) {
        let offset = this.pushString(str, desc);
        byte.writeVarInt(offset);
    }
}

class DbWriterSync {
    constructor() {
        this.strByte = new Byte();
        this.strOffset = {};
        this.strSameInfo = {};
    }

    readJsonData() {
        let all = {};
        let time = Date.now();
        let heads = this.readJson("heads");
        all["heads"] = heads;
        for (let i = 0; i < heads["file_num"]; i++) {
            let name = `data${i + 1}`;
            let bodyData = this.readJson(name); //一个data*.json文件
            all[name] = bodyData;
        }
        console.log("read json used time", Date.now() - time);
        return all;
    }

    jsonToBin(cbk) {
        let jsonDataAll = this.readJsonData();
        let heads = jsonDataAll["heads"];
        let tablesInfo = [];
        let tableIdx = 0;
        for (let i = 0; i < heads["file_num"]; i++) {
            let name = `data${i + 1}`;
            let bodyData = jsonDataAll[name];
            this.bodyToBin(tableIdx, i, heads, bodyData, tablesInfo);
            tableIdx += bodyData.values.length;
        }

        this.saveBin(tablesInfo, cbk);
    }

    saveBin(tablesInfo) {
        try {
            let names = [];
            let zip = new JSZipSync();
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
            fs.writeFileSync("./data/data.zip", Buffer.from(content))
        } catch (err) {
            console.error("save bin file failed", err && err.stack);
        }
    }

    //tableStart:表开始索引 由于有多个data文件 且公用一个head
    //bodyIdx: 第几个data文件
    bodyToBin(tableStart, dataFileIdx, heads, bodyData, tablesInfo) {
        assert(heads["tables"].length >= bodyData.values.length, "body data error");

        for (let i = 0; i < bodyData.values.length; i++) {
            let tableIdx = i + tableStart;
            let name = heads["tables"][tableIdx];
            let head_title = heads["heads"][tableIdx];
            let head_type = heads["heads_type"][tableIdx];
            let double_keys = heads["double_keys"][name];
            let body = bodyData.values[i];
            //每个表数据的偏移
            //有多个data文件 按顺序叠加
            let tableInfo = null;
            if (data_type == 1) {
                tableInfo = this.parseOneTableByBin(name, head_title, head_type, double_keys, body);
            } else if (data_type == 2) {
                tableInfo = this.parseOneTableByJson(name, head_title, head_type, double_keys, body);
            }
            let byteTable = this.oneTableBodyToBin(tableInfo);
            tablesInfo.push({ tableInfo: tableInfo, byteTable: byteTable, tableIdx: tableIdx, name: name });
        }
    }

    //分析一张表的数据 再转成二进制 为了得到精准的offset
    //tableInfo
    // head_info: {row_count, name}
    // ids: {id:offset}
    // head_title: [name, ...]
    // head_type: [0:int 1:string 2:json 3:float 4:any]
    // double_keys: {key:id}
    // string_block: StringBlock
    // data_byte: Byte
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

        let strBlock = new StringBlock();
        let dataByte = new Byte();
        tableInfo["string_block"] = strBlock;
        tableInfo["data_byte"] = dataByte;

        for (let j = 0; j < body.length; j++) {
            let id = body[j][0];
            ids[id] = dataByte.pos;
            let lineStr = JSON.stringify(body[j]);
            dataByte.writeUTFString(lineStr);  //先忽略字符串去重缓存
        }
        return tableInfo;
    }


    //分析一张表的数据 再转成二进制 为了得到精准的offset
    //tableInfo
    // head_info: {row_count, name}
    // ids: {id:offset}
    // head_title: [name, ...]
    // head_type: [0:int 1:string 2:json 3:float 4:any]
    // double_keys: {key:id}
    // string_block: StringBlock
    // data_byte: Byte
    parseOneTableByBin(name, head_title, head_type, double_keys, body) {
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

        let strBlock = new StringBlock();
        let dataByte = new Byte();
        tableInfo["string_block"] = strBlock;
        tableInfo["data_byte"] = dataByte;

        for (let j = 0; j < body.length; j++) {
            //line
            let id = body[j][0];
            ids[id] = dataByte.pos;
            for (let k = 0; k < body[j].length; k++) {
                //column
                //0:int 1:string 2:json 3:float 4:any
                let v = body[j][k];
                if (head_type[k] == 0) {
                    dataByte.writeVarInt(v);
                } else if (head_type[k] == 1) {
                    strBlock.writeStrToByte(dataByte, v, name);
                } else if (head_type[k] == 2) {
                    let txt = JSON.stringify(v);
                    strBlock.writeStrToByte(dataByte, txt, name);
                } else if (head_type[k] == 3) {
                    dataByte.writeFloat32(v);
                } else if (head_type[k] == 4) {
                    dataByte.writeAny(v);
                } else {
                    console.error("head type error", head_type[k]);
                }
            }
        }
        return tableInfo;
    }

    //二进制表内容
    // buf_head_len u32
    // buf_body_len u32
    // buf_string_len u32
    // buf_head
    // buf_body
    // buf_string
    oneTableBodyToBin(tableInfo) {
        let byteHead = new Byte();
        byteHead.writeUTFString(JSON.stringify(tableInfo["head_info"])); //tableInfo
        byteHead.writeUTFString(JSON.stringify(tableInfo["head_title"]));
        byteHead.writeUTFString(JSON.stringify(tableInfo["head_type"]));
        byteHead.writeUTFString32(tableInfo["double_keys"] ? JSON.stringify(tableInfo["double_keys"]) : "null");
        byteHead.writeUTFString32(JSON.stringify(tableInfo["ids"]));

        let byteBody = tableInfo["data_byte"];
        let byteStrBlock = tableInfo["string_block"].strByte;

        let byteTable = new Byte();
        byteTable.writeUint32(byteHead.length);
        byteTable.writeUint32(byteBody.length);
        byteTable.writeUint32(byteStrBlock.length);
        byteTable.writeArrayBuffer(byteHead.buffer);
        byteTable.writeArrayBuffer(byteBody.buffer);
        byteTable.writeArrayBuffer(byteStrBlock.buffer);
        return byteTable;
    }

    readJson(name) {
        let path = `./json/${name}.json`;
        let data = null;
        try {
            const text = fs.readFileSync(path, "utf8");
            data = JSON.parse(text);
        } catch (err) {
            console.error(`read failed:${path}`, err && err.stack);
        }
        return data;
    }
}

module.exports = DbWriterSync;
