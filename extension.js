const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
// @ts-ignore
const git = require("isomorphic-git");

const dir = vscode.workspace.workspaceFolders[0].uri.fsPath;
const patternRedirect = /@TABLE\.(\w+)\.(\w.+)\.?/g;
const outputChannel = vscode.window.createOutputChannel("AutoBrancher");

const FuncHelper = {
  selectCollection: () => {},
  parseRedirectStep: (fileContent) => {
    const matches = [...fileContent.matchAll(patternRedirect)];
    return matches.map(([, collection, document]) => ({
      collection,
      document,
    }));
  },

  findAllRedirectsDeep(obj, redirects = [], model = "") {
    if (typeof obj === "string") {
      let match;
      while ((match = patternRedirect.exec(obj)) !== null) {
        if (obj != "@TABLE.condition.cd_mapModelResponse.modelResponse") {
          redirects.push({ collection: match[1], document: match[2] });
        } else {
          console.log("match[1] match[2] == > ", match[1], match[2]);
        }
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        FuncHelper.findAllRedirectsDeep(item, redirects);
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const key in obj) {
        FuncHelper.findAllRedirectsDeep(obj[key], redirects);
      }
    }

    return redirects;
  },
};

class StackAPI {
  constructor(protocol) {
    this.protocol = protocol;
    this.listFile = [];
    this.modelName = "";
    this.redirectStepModel = "";
  }

  build() {
    this._firstStep();
    this._processRedirectStepRecursive(this.protocol);
    this._getMappingModel();
    this._getResourceProfile();

    return this.listFile;
  }

  _getResourceProfile() {
    const { url } = JSON.parse(this.protocol);
    const dirProfile = fs.readdirSync(path.join(dir, "resource_profile"));

    dirProfile.forEach((element) => {
      const data = fs.readFileSync(
        path.join(dir, "resource_profile", element),
        "utf-8"
      );
      const found = JSON.parse(data).uri.includes(url);
      if (found) {
        const result = JSON.parse(data);
        this.listFile.push({
          name: "resource_profile",
          fileName: `${result.resource}_${result.authenNode}-${result.authenType}.json`,
          value: result,
        });
      }
    });
  }

  _firstStep() {
    try {
      const parsed = JSON.parse(this.protocol);
      this.listFile.push({
        name: "protocol",
        fileName: `pt_${parsed.method}_${parsed.commandName}.json`,
        value: parsed,
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        "⛔ Error parsing protocol: " + error.message
      );
    }
  }
  async _selectCollection(fileContent) {
    console.log("fileContent ==> ", fileContent);
    const handlers = {
      validateCommand: (obj) => {
        const variable = obj[Object.keys(obj)[0]].variable;
        this.modelName = variable["@VAR.modelName"];
        console.log("this.modelName ==> ", this.modelName);
      },
      cd_mapModelResponse: (obj) => {
        const cd = JSON.parse(obj);
        const variable = cd[Object.keys(cd)[0]];

        const pattern = new RegExp(
          `'@VAR\\.modelName'\\s*==\\s*'${this.modelName}'`,
          "gm"
        );

        const model = variable.modelResponse.find((item) =>
          pattern.test(item.criteria.value)
        );
        console.log("model ==> ", model);

        if (model) {
          this.redirectStepModel = model.redirectStep;
        } else {
          console.warn("❗ No matching model found.");
        }
      },
    };

    try {
      const match = Object.keys(fileContent)[0].match(
        /^vc_|cd_mapModelResponse/gm
      );
      const verifyCollection = (prefix) => {
        const mapping = {
          vc_: "validateCommand",
          cd_mapModelResponse: "cd_mapModelResponse",
        };
        return mapping[prefix];
      };
      console.log("match ==> ", match, verifyCollection(match[0]));
      if (match) {
        handlers[verifyCollection(match[0])](fileContent);
      } else {
        // console.warn(`⚠️ No handler found for key: ${key}`);
      }
    } catch (e) {
      console.error("❌ Invalid JSON or parse error:", e);
    }
  }
  _getMappingModel() {
    try {
      const validateCommand = this.listFile.find(
        (item) => item.name == "validateCommand"
      );
      const handlers = {
        validateCommand: (obj) => {
          const variable = obj[Object.keys(obj)[0]].variable;
          this.modelName = variable["@VAR.modelName"];
          console.log("this.modelName ==> ", this.modelName);
        },
        cd_mapModelResponse: (obj) => {
          const cd = JSON.parse(obj);
          const variable = cd[Object.keys(cd)[0]];

          const pattern = new RegExp(
            `'@VAR\\.modelName'\\s*==\\s*'${this.modelName}'`,
            "gm"
          );

          const model = variable.modelResponse.find((item) =>
            pattern.test(item.criteria.value)
          );
          console.log("model ==> ", model);

          if (model) {
            this.redirectStepModel = model.redirectStep;
          } else {
            console.warn("❗ No matching model found.");
          }
        },
      };

      try {
        const match = Object.keys(validateCommand.value)[0].match(
          /^vc_|cd_mapModelResponse/gm
        );
        const verifyCollection = (prefix) => {
          const mapping = {
            vc_: "validateCommand",
            cd_mapModelResponse: "cd_mapModelResponse",
          };
          return mapping[prefix];
        };
        console.log("match ==> ", match, verifyCollection(match[0]));
        if (match) {
          handlers[verifyCollection(match[0])](validateCommand.value);
        } else {
        }
      } catch (e) {
        console.error("❌ Invalid JSON or parse error:", e);
      }

      this._selectCollection(validateCommand.value);
      const pathModelRseponse = path.join(
        dir,
        "condition",
        `cd_mapModelResponse.json`
      );

      const mappingModel = JSON.parse(
        fs.readFileSync(pathModelRseponse, "utf-8")
      );
      this.listFile.push({
        name: "condition",
        fileName: `cd_mapModelResponse.json`,
        value: mappingModel,
      });
      const pattern = new RegExp(
        `'@VAR\\.modelName'\\s*==\\s*'${this.modelName}'`,
        "gm"
      );

      const model = mappingModel.cd_mapModelResponse.modelResponse.find(
        (item) => pattern.test(item.criteria.value)
      );
      console.log("model ==> ", model);

      if (model) {
        const splitDot = model.redirectStep.split(".");

        const fileContent = fs.readFileSync(
          path.join(dir, splitDot[1], splitDot[2] + ".json"),
          "utf-8"
        );
        this.redirectStepModel = fileContent;
        this._processRedirectStepRecursive(this.redirectStepModel);
      } else {
        console.warn("❗ No matching model found.");
      }
    } catch (error) {
      console.log("error ==> ", error);
    }
  }
  async _processRedirectStepRecursive(fileContent) {
    let redirectList = [];
    try {
      const json = JSON.parse(fileContent);
      redirectList = FuncHelper.findAllRedirectsDeep(json, []);
    } catch (e) {
      outputChannel.appendLine(` ❌ Error : ${e}`);
      redirectList = FuncHelper.parseRedirectStep(fileContent);
    }

    const uniqueRedirects = [
      ...new Set(redirectList.map((r) => `${r.collection}.${r.document}`)),
    ].map((str) => {
      const [collection, document] = str.split(".");
      return { collection, document };
    });
    for (const { collection, document } of uniqueRedirects) {
      const filePath = path.join(dir, collection, `${document}.json`);
      const alreadyExists = this.listFile.some(
        (item) =>
          item.name === collection && item.fileName === `${document}.json`
      );
      if (alreadyExists) continue;

      try {
        const data = fs.readFileSync(filePath, "utf-8");
        this.listFile.push({
          name: collection,
          fileName: `${document}.json`,
          value: JSON.parse(data),
        });
        this._processRedirectStepRecursive(data);
      } catch (e) {
        outputChannel.appendLine(` ❌ Error : ${e}`);
        outputChannel.appendLine(`⚠️ Missing file: ${filePath}`);
      }
    }
  }
}

async function runGenerate(input, mode = "branch") {
  try {
    const protocolPath = path.join(dir, "protocol");
    const folder = fs
      .readdirSync(protocolPath)
      .filter((file) => file.endsWith(".json")); // ✅ กรองเฉพาะ .json

    if (input === "*") {
      for (const item of folder) {
        const protocol = fs.readFileSync(
          path.join(protocolPath, item),
          "utf-8"
        );
        await handleProtocol(protocol, mode);
      }
    } else {
      let matchedData = "";
      const matched = folder.find((item) => {
        const data = fs.readFileSync(path.join(protocolPath, item), "utf-8");
        const json = JSON.parse(data);
        if (json.commandName === input) {
          matchedData = path.join(protocolPath, item);
          return true;
        }
        return false;
      });

      if (matched) {
        const protocol = fs.readFileSync(matchedData, "utf-8");
        await handleProtocol(protocol, mode);
      } else {
        outputChannel.appendLine(
          `❌ No matching protocol for input "${input}"`
        );
      }
    }
  } catch (error) {
    outputChannel.appendLine("❌ Error: " + error.message);
  }
}


function runGenerateByCommand(input) {
  try {
    const table = input.split(".");
    const pathFile = path.join(dir, table[1], table[2] + ".json");
    const file = fs.readFileSync(pathFile, "utf-8");
    const jsonContent = JSON.parse(file);
    const update = JSON.stringify({ $set: jsonContent }, null, 2);

    const script = `
db.getCollection("${table[1]}").updateOne(
  { '${Object.keys(jsonContent)[0]}' : {$exists : true}},
  ${update},
  { upsert: true }
);\n`;

    fs.writeFileSync(path.join(dir, "dist", `${table[2]}.js`), script);
    outputChannel.appendLine(
      `✅ Generated script file at: ${path.join(
        dir,
        "dist",
        table[1] + "_" + table[2]
      )}`
    );
  } catch (error) {
    outputChannel.appendLine(`❌ Generated script Error : ${error}`);
  }
}

async function generateScriptOnly(protocol) {
  const api = await new StackAPI(protocol).build();
  console.log("api ==> ", api);
  const outputDir = path.join(dir, "dist");
  const outputFile = path.join(
    outputDir,
    `${api[0].value.method}_${api[0].value.commandName}.js`
  );

  fs.mkdirSync(outputDir, { recursive: true });

  let scriptContent = "";

  api.forEach((obj) => {
    //
    const collectionName = obj.name;
    const filter =
      obj.name === "protocol"
        ? JSON.stringify({ url: obj.value.url }, null, 2)
        : obj.name === "resource_profile"
        ? JSON.stringify({ resource: obj.value.resource }, null, 2)
        : JSON.stringify(
            { [Object.keys(obj.value)[0]]: { $exists: true } },
            null,
            2
          );

    const update = JSON.stringify({ $set: obj.value }, null, 2);

    const script = `
db.getCollection("${collectionName}").updateOne(
  ${filter},
  ${update},
  { upsert: true }
);\n`;
    scriptContent += script;
  });

  fs.writeFileSync(outputFile, scriptContent);
  //
  outputChannel.appendLine(`✅ Generated script file at: ${outputFile}`);
}

async function createBranchFromProtocol(protocol) {
  const api = new StackAPI(protocol).build();
  const { commandName, method } = api[0].value;
  const newBranch = `feature/api_${method}-${commandName}`;
  await git.checkout({ fs, dir, ref: "template", force: true });

  try {
    await git.deleteBranch({ fs, dir, ref: newBranch });
  } catch (e) {
    outputChannel.appendLine(` ❌ Error : ${e}`);
    // may not exist — ignore
  }

  await git.branch({ fs, dir, ref: newBranch });
  await git.checkout({ fs, dir, ref: newBranch });

  api.forEach((obj) => {
    const jsonContent = JSON.stringify(obj.value, null, 4);
    const filePath = path.join(dir, obj.name, obj.fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, jsonContent);
  });

  outputChannel.appendLine(
    `✅ Created and checked out to branch ${newBranch} from template`
  );
}

async function handleProtocol(protocol, mode) {
  if (mode === "script") {
    generateScriptOnly(protocol);
  } else {
    await createBranchFromProtocol(protocol);
  }
}
// VS Code activation
function activate(context) {
  const disposable = vscode.commands.registerCommand(
    "autobrancher.run",
    async () => {
      outputChannel.clear();
      outputChannel.show();
      const input = await vscode.window.showInputBox({
        prompt: "กรุณากรอก commandName ที่ต้องการ",
        placeHolder: "เช่น cpassCallback หรือต้องการทั้งหมดใส่ *",
        ignoreFocusOut: true,
      });
      //

      runGenerate(input, "branch");
    }
  );

  const generateScriptDB = vscode.commands.registerCommand(
    "generateScript.run",
    async () => {
      outputChannel.clear();
      outputChannel.show();

      const input = await vscode.window.showInputBox({
        prompt: "กรุณากรอก commandName ที่ต้องการสร้าง script",
        placeHolder: "เช่น cpassCallback หรือต้องการทั้งหมดใส่ *",
        ignoreFocusOut: true,
      });

      runGenerate(input, "script");
    }
  );

  const generateScriptByCommand = vscode.commands.registerCommand(
    "generateScriptByCommand.run",
    async () => {
      outputChannel.clear();
      outputChannel.show();

      const input = await vscode.window.showInputBox({
        prompt: "กรุณากรอก Script ที่ต้องการสร้าง ",
        placeHolder: "เช่น @TABLE.xxxx.xxxx",
        ignoreFocusOut: true,
      });
      runGenerateByCommand(input);
      // runGenerate(input, "script");
    }
  );
  context.subscriptions.push(generateScriptByCommand);
  context.subscriptions.push(generateScriptDB);
  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
