import axios from 'axios';
import FormData from 'form-data';
import { exec } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import * as task from 'azure-pipelines-task-lib/task';

// Function to execute the semgrep scan command and stream output in real-time
const runSemgrepScan = (): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const process = exec('semgrep scan --json -o semgrep-report.json');

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
      } else {
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

    const data = new FormData();
    data.append('product', product);
    data.append('engagement', engagement);
    data.append('test', 'Semgrep JSON Report');
    data.append('branch', branch);
    data.append('origin', 'CI/CD');

    const semgrepReportPath = path.resolve('semgrep-report.json');
    const semgrepReport = fs.createReadStream(semgrepReportPath);
    data.append('file', semgrepReport);

    const config = {
      method: 'post',
      url: 'https://[ddconnector]/api/v1/upload',
      headers: {
        'Accept': '*/*',
        'Host': 'devsecops.bbts.com.br',
        'Connection': 'keep-alive',
        ...data.getHeaders(),
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      data: data,
    };

    const response = await axios(config);
    console.log(JSON.stringify(response.data));
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error('Axios error:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);

        if (error.response.status >= 500) {
          process.exit(2); // Specific exit code for server errors
        } else {
          process.exit(1); // General exit code for other errors
        }
      } else if (error.request) {
        console.error('No response received:', error.request);
        process.exit(1); // Exit code for no response received
      }
    } else if (error instanceof Error) {
      console.error('Error:', error.message);
      process.exit(1); // General exit code for other errors
    } else {
      console.error('Unexpected error:', error);
      process.exit(1); // General exit code for other errors
    }
  } finally {
    // Ensure the semgrep-report.json is deleted
    fs.unlink('semgrep-report.json', (err) => {
      if (err) {
        console.error('Error deleting semgrep-report.json:', err);
        process.exit(1); // Exit code for file deletion error
      } else {
        console.log('semgrep-report.json was deleted');
      }
    });
  }
};

sendRequest().catch((err) => {
  console.error('Unexpected error in sendRequest:', err);
  process.exit(1); // Exit code for unexpected errors
});

