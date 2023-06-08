"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMsdoBreakEnvironmentVariable = exports.removeExtension = exports.isLatestPreRelease = exports.isLatest = exports.isPreRelease = exports.ensureDirectory = exports.isDirectory = exports.getDirectories = exports.directoryExists = exports.parseBool = exports.isNullOrWhiteSpace = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const core = __importStar(require("@actions/core"));
function isNullOrWhiteSpace(value) {
    return !value || !value.trim();
}
exports.isNullOrWhiteSpace = isNullOrWhiteSpace;
function parseBool(value) {
    let boolValue = false;
    if (value != null) {
        value = value.trim().toUpperCase();
        boolValue = (value == 'TRUE' || value == '1');
    }
    return boolValue;
}
exports.parseBool = parseBool;
function directoryExists(directoryPath) {
    return new Promise((resolve, reject) => {
        fs.stat(directoryPath, (err, stats) => {
            if (err) {
                resolve(false);
            }
            else {
                resolve(stats.isDirectory());
            }
        });
    });
}
exports.directoryExists = directoryExists;
function getDirectories(directory) {
    return fs.readdirSync(directory).filter(p => this.isDirectory(directory, p));
}
exports.getDirectories = getDirectories;
function isDirectory(directory, p) {
    return fs.statSync(path.join(directory, p)).isDirectory();
}
exports.isDirectory = isDirectory;
function ensureDirectory(directory) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
    }
}
exports.ensureDirectory = ensureDirectory;
function isPreRelease(version) {
    return version != null && version.indexOf('-') > 1;
}
exports.isPreRelease = isPreRelease;
function isLatest(version) {
    return version == undefined || version == null || version === 'Latest' || version === 'LatestPreRelease';
}
exports.isLatest = isLatest;
function isLatestPreRelease(version) {
    return version === 'LatestPreRelease';
}
exports.isLatestPreRelease = isLatestPreRelease;
function removeExtension(filePath) {
    const dirname = path.dirname(filePath);
    const basename = path.basename(filePath, path.extname(filePath));
    return path.join(dirname, basename);
}
exports.removeExtension = removeExtension;
function getMsdoBreakEnvironmentVariable() {
    let msdoBreak = parseBool(process.env.MSDO_BREAK);
    core.debug(`msdoBreak = ${msdoBreak}`);
    return msdoBreak;
}
exports.getMsdoBreakEnvironmentVariable = getMsdoBreakEnvironmentVariable;
