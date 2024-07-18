import { DbWriter } from "./src/DbWriter.js";
import { DbReader } from "./src/DbReader.js";
// import {A} from "./src/libs/TestA.js";




function Main(dbJsonPath) {
    let dbWriter = new DbWriter();
    dbWriter.jsonToBin(dbJsonPath + "/json/");

    let dbReader = new DbReader();
    dbReader.readDb(dbJsonPath + "/data/");
}

// 获取所有命令行参数
// 0：Node.js 可执行文件的路径。
// 1：正在执行的 JavaScript 文件的路径。
const args = process.argv;
console.log("execpath", process.execPath);
console.log(args);

let excelPath = args[2] || process.cwd()
Main(excelPath);
