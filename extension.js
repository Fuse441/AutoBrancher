const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
// @ts-ignore
const git = require('isomorphic-git');

const dir = vscode.workspace.workspaceFolders[0].uri.fsPath;
const patternRedirect = /@TABLE\.(\w+)\.(\w+)/g;
const outputChannel = vscode.window.createOutputChannel('AutoBrancher');
const FuncHelper = {
  parseRedirectStep: (fileContent) => {
    const matches = [...fileContent.matchAll(patternRedirect)];
    return matches.map(([, collection, document]) => ({ collection, document }));
  },
  findAllRedirectsDeep(obj, redirects = []) {
    if (typeof obj === 'string') {
      let match;
      while ((match = patternRedirect.exec(obj)) !== null) {
        redirects.push({ collection: match[1], document: match[2] });
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        FuncHelper.findAllRedirectsDeep(item, redirects);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        FuncHelper.findAllRedirectsDeep(obj[key], redirects);
      }
    }
    return redirects;
  }
};

class StackAPI {
  constructor(protocol) {
    this.protocol = protocol;
    this.listFile = [];
  }

  build() {
    this._firstStep();
    this._processRedirectStepRecursive(this.protocol);
    this._getResourceProfile();
    return this.listFile;
  }

  _getResourceProfile() {
    const { url } = JSON.parse(this.protocol);
    const dirProfile = fs.readdirSync(path.join(dir, 'resource_profile'));

    dirProfile.forEach(element => {
      const data = fs.readFileSync(path.join(dir, 'resource_profile', element), 'utf-8');
      const found = JSON.parse(data).uri.includes(url);
      if (found) {
        const result = JSON.parse(data);
        this.listFile.push({
          name: 'resource_profile',
          fileName: `${result.resource}_${result.authenNode}-${result.authenType}.json`,
          value: result
        });
      }
    });
  }

  _firstStep() {
    try {
      const parsed = JSON.parse(this.protocol);
      this.listFile.push({
        name: 'protocol',
        fileName: `pt_${parsed.method}_${parsed.commandName}.json`,
        value: parsed
      });
    } catch (error) {
      vscode.window.showErrorMessage('⛔ Error parsing protocol: ' + error.message);
    }
  }

  _processRedirectStepRecursive(fileContent) {
    let redirectList = [];
    try {
      const json = JSON.parse(fileContent);
      redirectList = FuncHelper.findAllRedirectsDeep(json);
    } catch (e) {
      redirectList = FuncHelper.parseRedirectStep(fileContent);
    }

    const uniqueRedirects = [...new Set(redirectList.map(r => `${r.collection}.${r.document}`))]
      .map(str => {
        const [collection, document] = str.split('.');
        return { collection, document };
      });

    for (const { collection, document } of uniqueRedirects) {
      if (document === 'cd_mapModelResponse') continue;

      const filePath = path.join(dir, collection, `${document}.json`);
      const alreadyExists = this.listFile.some(
        item => item.name === collection && item.fileName === `${document}.json`
      );
      if (alreadyExists) continue;

      try {
        const data = fs.readFileSync(filePath, 'utf-8');
        this.listFile.push({ name: collection, fileName: `${document}.json`, value: JSON.parse(data) });
        this._processRedirectStepRecursive(data);
      } catch (e) {
		outputChannel.appendLine(`⚠️ Missing file: ${filePath}`);
      }
    }
  }
}

async function runGenerate(input, mode = 'branch') {
  try {
    const protocolPath = path.join(dir, 'protocol');
    const folder = fs.readdirSync(protocolPath);

    if (input === '*') {
      for (const item of folder) {
        const protocol = fs.readFileSync(path.join(protocolPath, item), 'utf-8');
        await handleProtocol(protocol, mode);
      }
    } else {
      let matchedData = '';
      const matched = folder.find((item) => {
        const data = fs.readFileSync(path.join(protocolPath, item), 'utf-8');
        const json = JSON.parse(data);
        if (json.commandName === input) {
          matchedData = path.join(protocolPath, item);
          return true;
        }
        return false;
      });

      if (matched) {
        const protocol = fs.readFileSync(matchedData, 'utf-8');
        await handleProtocol(protocol, mode);
      } else {
        outputChannel.appendLine(`❌ No matching protocol for input "${input}"`);
      }
    }
  } catch (error) {
    outputChannel.appendLine('❌ Error: ' + error.message);
  }
}

async function generateScriptOnly(protocol) {
  const api = new StackAPI(protocol).build();
  const outputDir = path.join(dir,"dist");
  const outputFile = path.join(outputDir, `${api[0].value.method}_${api[0].value.commandName}.js`);

  fs.mkdirSync(outputDir, { recursive: true });

  let scriptContent = '';

  api.forEach((obj) => {
  console.log("obj ==> ", obj);
    const collectionName = obj.name;
    const filter = obj.name == "protocol" ? JSON.stringify({ url : obj.value.url }, null, 2) : JSON.stringify({ [Object.keys(obj.value)[0]]: { $exists: true } }, null, 2);
    const update = JSON.stringify({ $set:  obj.value  }, null, 2)

    const script = `
db.getCollection("${collectionName}").updateOne(
  ${filter},
  ${update},
  { upsert: true }
);\n`;
    scriptContent += script;
  });

  fs.writeFileSync(outputFile, scriptContent);
  // console.log("scriptContent ==> ", scriptContent);
  outputChannel.appendLine(`✅ Generated script file at: ${outputFile}`);
}

async function createBranchFromProtocol(protocol) {
  const api = new StackAPI(protocol).build();
  const { commandName, method } = api[0].value;
  const newBranch = `feature/api_${method}-${commandName}`;

  await git.checkout({ fs, dir, ref: 'template', force: true });

  try {
    await git.deleteBranch({ fs, dir, ref: newBranch });
  } catch (e) {
    // may not exist — ignore
  }

  await git.branch({ fs, dir, ref: newBranch });
  await git.checkout({ fs, dir, ref: newBranch });

  api.forEach((obj) => {
    const jsonContent = JSON.stringify(obj.value, null, 2);
    const filePath = path.join(dir, obj.name, obj.fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, jsonContent);
  });

  outputChannel.appendLine(`✅ Created and checked out to branch ${newBranch} from template`);
}

async function handleProtocol(protocol, mode) {
  if (mode === 'script') {
    generateScriptOnly(protocol);
  } else {
    await createBranchFromProtocol(protocol);
  }
}
// VS Code activation
function activate(context) {
  const disposable = vscode.commands.registerCommand('autobrancher.run', async () => {
	outputChannel.clear();
	outputChannel.show();
	const input = await vscode.window.showInputBox({
		prompt: 'กรุณากรอก commandName ที่ต้องการ',
		placeHolder: 'เช่น cpassCallback หรือต้องการทั้งหมดใส่ *',
		ignoreFocusOut: true
	});
	// console.log("input ==> ", input);

  runGenerate(input, 'branch');

  });


  
  const generateScriptDB = vscode.commands.registerCommand('generateScript.run', async () => {
    outputChannel.clear();
    outputChannel.show();
  
    const input = await vscode.window.showInputBox({
      prompt: 'กรุณากรอก commandName ที่ต้องการสร้าง script',
      placeHolder: 'เช่น cpassCallback หรือต้องการทั้งหมดใส่ *',
      ignoreFocusOut: true
    });
  
    runGenerate(input, 'script');


  });
  
    context.subscriptions.push(generateScriptDB);
  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

