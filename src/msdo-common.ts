import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';

/**
 * Checks if the string is null or whitespace
 * 
 * @param value - The string to check for null or whitespace
 * @returns True if the string is null or whitespace, false otherwise
 */
export function isNullOrWhiteSpace(value: string) : boolean {
    return !value || !value.trim();
}

/**
 * Parses a string into a boolean
 * 
 * @param value - The string to parse into a boolean
 * @returns True if the string is 'true' or '1', false otherwise
 */
export function parseBool(value: string) : boolean {
    let boolValue = false;

    if (value != null) {
        value = value.trim().toUpperCase();
        boolValue = (value == 'TRUE' || value == '1');
    }

    return boolValue;
}

/**
 * Checks if the given directory exists
 * 
 * @param directoryPath - The directory to check if it exists
 * @returns True if the directory exists, false otherwise
 */
export function directoryExists(directoryPath): Promise<boolean> {
    return new Promise((resolve, reject) => {
        fs.stat(directoryPath, (err, stats) => {
            if (err) {
                resolve(false);
            } else {
                resolve(stats.isDirectory());
            }
        });
    });
}

/**
 * Gets the directories in the given directory
 * 
 * @param directory - The directory to search for directories
 * @returns An array of directories in the given directory
 */
export function getDirectories(directory: string) : string[] {
    // read the directory for all paths
    // filter for directories
    return fs.readdirSync(directory).filter(p => isDirectory(directory, p));
}

/**
 * Checks if the given path is a directory
 * 
 * @param directory - The parent directory
 * @param p - The name of the file or directory to check
 * @returns True if the given path is a directory, false otherwise
 */
export function isDirectory(directory: string, p: string) : boolean {
    // statSync follows symlinks
    return fs.statSync(path.join(directory, p)).isDirectory();
}

/**
 *  Ensures the given directory exists
 * 
 * @param directory - The directory to ensure exists
 */
export function ensureDirectory(directory: string) : void {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
    }
}

/**
 * Checks if the given version is a pre-release version
 * 
 * @param version - The version to check
 * @returns True if the version is a pre-release version, false otherwise
 */
export function isPreRelease(version: string): boolean {
    return version != null && version.indexOf('-') > 1;
}

/**
 * Checks if the given version is 'Latest' or 'LatestPreRelease'
 * 
 * @param version - The version to check
 * @returns True if the version is 'Latest' or 'LatestPreRelease', false otherwise
 */
export function isLatest(version: string): boolean {
    return version == undefined || version == null || version === 'Latest' || version === 'LatestPreRelease';
}

/**
 * Checks if the given version is 'LatestPreRelease'
 * 
 * @param version - The version to check
 * @returns True if the version is 'LatestPreRelease', false otherwise
 */
export function isLatestPreRelease(version: string): boolean {
    return version === 'LatestPreRelease';
}

/**
 * Gets the file name from the given file path
 * 
 * @param filePath - The file path to remove the extension from
 * @returns The file path without the extension
 */
export function removeExtension(filePath: string): string {
    const dirname = path.dirname(filePath);
    const basename = path.basename(filePath, path.extname(filePath));
    return path.join(dirname, basename);
}

/**
 * Gets the MSDO_BREAK environment variable value
 * 
 * @returns True if the MSDO_BREAK environment variable is set to true, false otherwise
 */
export function getMsdoBreakEnvironmentVariable() : boolean {
    let msdoBreak = parseBool(process.env.MSDO_BREAK);
    core.debug(`msdoBreak = ${msdoBreak}`);
    return msdoBreak;
}

/**
 * Returns a promise that will resolve after the given number of milliseconds.
 * 
 * @param ms The number of milliseconds to sleep
 * @returns An awaitable promise
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Lazy checks if the version1 is greater than or equal to version2.
 * 
 * @param version1 The version to check.
 * @param version2 The version to compare against.
 * @returns True if the version is greater than or equal to version2, or true in any error condition.
 */
export function isVersionGreaterThanOrEqualTo(version1: string, version2: string): boolean {
    if (version1 == null || version2 == null) {
        return true;
    }

    let version1Parts = version1.split('.');
    let version2Parts = version2.split('.');

    if (version1Parts == null || version2Parts == null) {
        return true;
    }

    let version1Part = 0;
    let version2Part = 0;

    for (let i = 0; i < version1Parts.length; i++) {
        version1Part = parseInt(version1Parts[i] || '0');
        version2Part = parseInt(version2Parts[i] || '0');

        if (version1Part > version2Part) {
            return true;
        }
        else if (version1Part < version2Part) {
            return false;
        }
    }

    return true;
}