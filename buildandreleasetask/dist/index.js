"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const task = __importStar(require("azure-pipelines-task-lib/task"));
// Function to execute the semgrep scan command and stream output in real-time
const runSemgrepScan = () => {
    return new Promise((resolve, reject) => {
        const process = (0, child_process_1.exec)('semgrep scan --json -o semgrep-report.json');
        if (process.stdout) {
            process.stdout.on('data', (data) => {
                console.log(data.toString());
            });
        }
        if (process.stderr) {
            process.stderr.on('data', (data) => {
                console.error(data.toString());
            });
        }
        process.on('exit', (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`semgrep process exited with code ${code}`));
            }
        });
    });
};
// Function to send the request
const sendRequest = async () => {
    try {
        await runSemgrepScan();
        // Access Azure Pipelines environment variables using task library
        const product = task.getVariable('System.TeamProject') || 'unknown-project';
        const engagement = task.getVariable('Build.Repository.Name') || 'unknown-repo';
        const branch = task.getVariable('Build.SourceBranchName') || 'unknown-branch';
        const data = new form_data_1.default();
        data.append('product', product);
        data.append('engagement', engagement);
        data.append('test', 'Semgrep JSON Report');
        data.append('branch', branch);
        const semgrepReportPath = path_1.default.resolve('semgrep-report.json');
        const semgrepReport = fs_1.default.createReadStream(semgrepReportPath);
        data.append('file', semgrepReport);
        const config = {
            method: 'post',
            url: 'https://devsecops.bbts.com.br/api/v1/upload',
            headers: {
                'Accept': '*/*',
                'Host': 'devsecops.bbts.com.br',
                'Connection': 'keep-alive',
                ...data.getHeaders(),
            },
            httpsAgent: new https_1.default.Agent({
                rejectUnauthorized: false,
            }),
            data: data,
        };
        const response = await (0, axios_1.default)(config);
        console.log(JSON.stringify(response.data));
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            console.error('Axios error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
                console.error('Response status:', error.response.status);
                console.error('Response headers:', error.response.headers);
                if (error.response.status >= 500) {
                    process.exit(2); // Specific exit code for server errors
                }
                else {
                    process.exit(1); // General exit code for other errors
                }
            }
            else if (error.request) {
                console.error('No response received:', error.request);
                process.exit(1); // Exit code for no response received
            }
        }
        else if (error instanceof Error) {
            console.error('Error:', error.message);
            process.exit(1); // General exit code for other errors
        }
        else {
            console.error('Unexpected error:', error);
            process.exit(1); // General exit code for other errors
        }
    }
    finally {
        // Ensure the semgrep-report.json is deleted
        fs_1.default.unlink('semgrep-report.json', (err) => {
            if (err) {
                console.error('Error deleting semgrep-report.json:', err);
                process.exit(1); // Exit code for file deletion error
            }
            else {
                console.log('semgrep-report.json was deleted');
            }
        });
    }
};
sendRequest().catch((err) => {
    console.error('Unexpected error in sendRequest:', err);
    process.exit(1); // Exit code for unexpected errors
});
