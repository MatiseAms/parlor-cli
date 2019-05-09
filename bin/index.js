#! /usr/bin/env node
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ejs = require("ejs");
const AdmZip = require("adm-zip");
const mkdirp = require("mkdirp");
const inquirer = require("inquirer");
inquirer.registerPrompt("filePath", require("inquirer-file-path"));
inquirer.registerPrompt("directory", require("inquirer-directory"));
const commands = ["images", "typo", "fonts", "colors", "grid"];
const Spinner = require("cli-spinner").Spinner;
let config = {};

let args = process.argv;

const imageOutput = {
  type: "directory",
  basePath: "./",
  name: "image",
  message: "Enter your image output"
};

const fontOutput = {
  type: "directory",
  name: "fonts",
  basePath: "./",
  message:
    "In which folder do you want to store your fonts? (fonts will be store into a fonts folder)"
};

const typoFolder = {
  type: "directory",
  basePath: "./",
  name: "typofolder",
  message:
    "Enter your typo ouptput folder (files will be saved as _parlor-usage and _parlor-embed)"
};

const gridOutput = {
  type: "directory",
  basePath: "./",
  name: "grid",
  message: "Enter your grid output (file will be saved as _parlor-grid.scss)"
};

const colorsOutput = {
  type: "directory",
  basePath: "./",
  name: "color",
  message:
    "Enter your colors output (file will be saved as _parlor-custom-colors.scss)"
};

//start of functions
(async () => {
  let questions = [];
  let host = "https://api.parlor.mati.se";
  const indexOfDev = args.indexOf("--dev");
  if (indexOfDev > -1) {
    console.log(
      chalk.green("development mode enabled, looking for http://localhost:3000")
    );
    args.splice(indexOfDev, 1);
    host = "http://localhost:3000";
  }
  if (args[2] === "all") {
    args.length -= 1;
    args = args.concat(commands);
  }
  if (!args[2]) {
    await new Promise(resolve => {
      inquirer
        .prompt([
          {
            type: "checkbox",
            name: "args",
            message: "What do you want to update?",
            choices: ["Images", "Typo", "Fonts", "Colors", "Grid"]
          }
        ])
        .then(answers => {
          if (!args[2]) {
            const anser = answers.args.map(ans => ans.toLowerCase());
            args = args.concat(anser);
          }
          resolve();
        });
    });
  }
  if (fs.existsSync("./parlor.config.js")) {
    config = require(`${process.cwd()}/parlor.config.js`);
  }
  if (!config.projectId) {
    questions.push({
      type: "number",
      name: "id",
      message: "Enter your project ID of Parlor"
    });
  }
  if (!config.username && !config.password) {
    questions = questions.concat([
      {
        type: "text",
        name: "user",
        message: "Enter your username or email"
      },
      {
        type: "password",
        name: "password",
        message: "Enter your password"
      }
    ]);
  }

  if (args.includes("colors") && !config.colors) {
    questions.push(colorsOutput);
  }
  if (args.includes("grid") && !config.grid) {
    questions.push(gridOutput);
  }
  if (args.includes("typo")) {
    if (!config.typoFolder) {
      questions.push(typoFolder);
    }
  }
  if (args.includes("fonts")) {
    if (!config.fonts) {
      questions.push(fontOutput);
    }
  }
  if (args.includes("images") && !config.images) {
    questions.push(imageOutput);
  }

  await new Promise(resolve => {
    inquirer.prompt(questions).then(answers => {
      if (answers.id) {
        config.projectId = answers.id;
      }
      if (answers.user && answers.password) {
        config.username = answers.user;
        config.password = answers.password;
      }
      if (answers.color) {
        config.colors = answers.color;
      }
      if (answers.typofolder) {
        config.typoFolder = answers.typofolder;
      }
      if (answers.grid) {
        config.grid = answers.grid;
      }

      if (answers.fonts) {
        let fontOutput = answers.fonts.split("/");
        if (fontOutput[fontOutput.length - 1] === "fonts") {
          fontOutput.length -= 1;
        }
        config.fonts = fontOutput.join("/");
      }

      if (answers.image) {
        let imageOutput = answers.image.split("/");
        if (imageOutput[imageOutput.length - 1] === "images") {
          imageOutput.length -= 1;
        }
        config.images = imageOutput.join("/");
      }
      resolve();
    });
  });

  if (!config.typoSettingsFilename) {
    config.typoSettingsFilename = "_parlor-usage.scss";
  }
  if (!config.typoEmbedFilename) {
    config.typoEmbedFilename = "_parlor-embed.scss";
  }
  if (!config.colorFilename) {
    config.colorFilename = "_parlor-custom-colors.scss";
  }
  if (!config.gridFilename) {
    config.gridFilename = "_parlor-grid.scss";
  }
  // usage represents the help guide
  const usageHelper = () => {
    const usageText = `
	  USAGE:
	    parlor

	  COMMANDS can be:

	    build:      used to write your files
	    update:      used to retrieve your data
	    help:     used to print the usage guide
	  `;

    console.log(usageText);
  };

  // used to log errors to the console in red color
  const errorLog = error => {
    const eLog = chalk.red(error);
    console.log(eLog);
  };

  const createColorFile = colors => {
    let text;
    const colorNames = [];
    colors = colors.filter((color, index) => {
      if (colorNames.includes(color.name)) {
        color.name += index;
      } else {
        colorNames.push(color.name);
        return true;
      }
    });
    ejs.renderFile(
      `${__dirname}/ejs/color.ejs`,
      { colors },
      null,
      (err, str) => {
        text = str;
      }
    );
    return text;
  };

  const createTypoFile = typographies => {
    let text;
    const diff = typographies.reduce((accum, curr) => {
      const indexOf = accum.findIndex(arr => arr.key === curr.family);
      if (indexOf > -1) {
        accum[indexOf].values.push(curr);
      } else {
        accum.push({
          key: curr.family,
          values: [curr]
        });
      }
      return accum;
    }, []);
    diff.forEach(typo => {
      let weights = [];
      typo.values.forEach(font => {
        weights = weights.concat(font.weight);
      });
      weights = [...new Set(weights)];
      const formattedWeights = weights.map(weight => {
        const value = valueSwitch(weight);
        return {
          name: weight,
          value: value
        };
      });
      const hasItalic = typo.values.map(font => font.hasItalic).includes(true);
      typo.weights = formattedWeights;
      typo.hasItalic = hasItalic;
    });
    ejs.renderFile(
      `${__dirname}/ejs/typo.ejs`,
      { fonts: diff },
      null,
      (err, str) => {
        text = str;
      }
    );
    return text;
  };
  const createTypoFileSettings = typographies => {
    let text;
    const typoDup = [...typographies];
    typoDup.forEach(typo => {
      typo.gridSize = `grid(${typo.baseSize}/80)`;
      typo.weight = typo.weight.map(weight => {
        return valueSwitch(weight);
      });
    });
    ejs.renderFile(
      `${__dirname}/ejs/typo-settings.ejs`,
      { fonts: typoDup },
      null,
      (err, str) => {
        text = str;
      }
    );
    return text;
  };

  const valueSwitch = value => {
    switch (value.toLowerCase()) {
      case "medium":
        return "500";
      case "regular":
        return "400";
      case "semibold":
        return "600";
      case "bold":
        return "700";
      case "heavy":
        return "900";
      case "light":
        return "300";
      case "thin":
        return "200";
      default:
        return "400";
    }
  };

  const writeColors = async project => {
    if (!config.colors) {
      config.colors = "";
    }
    await checkOrCreateFolder(`${process.cwd()}/${config.colors}/`);
    const colorScss = createColorFile(project.data.colors);
    fs.writeFile(
      `${process.cwd()}/${config.colors}/${config.colorFilename}`,
      colorScss,
      err => {
        if (err) {
          return console.log(err);
        }
        console.log(
          chalk.green(
            `The Colors are saved at ${config.colors}/${config.colorFilename}!`
          )
        );
      }
    );
  };

  const writeGrid = async project => {
    if (!config.grid) {
      config.grid = "";
    }
    await checkOrCreateFolder(`${process.cwd()}/${config.grid}/`);
    const outputGrid = `$grid-columns: ${project.data.grids[0].value};`;
    fs.writeFile(
      `${process.cwd()}/${config.grid}/${config.gridFilename}`,
      outputGrid,
      err => {
        if (err) {
          return console.log(chalk.red(err));
        }
        console.log(
          chalk.green(
            `The grid file was saved at ${config.grid}/${config.gridFilename}!`
          )
        );
      }
    );
  };

  const writeTypo = async project => {
    if (!config.typoFolder) {
      config.typoFolder = "";
    }
    const typos = [...project.data.typographies];
    const typoScss = createTypoFile(typos);
    fs.writeFile(
      `${process.cwd()}/${config.typoFolder}/${config.typoEmbedFilename}`,
      typoScss,
      err => {
        if (err) {
          return console.log(err);
        }
        console.log(
          chalk.green(
            `The typo was saved at ${config.typoFolder}/${
              config.typoEmbedFilename
            }!`
          )
        );
      }
    );
    const typoSettings = createTypoFileSettings(project.data.typographies);
    await checkOrCreateFolder(`${process.cwd()}/${config.typoFolder}/`);

    fs.writeFile(
      `${process.cwd()}/${config.typoFolder}/${config.typoSettingsFilename}`,
      typoSettings,
      err => {
        if (err) {
          return console.log(err);
        }
        console.log(
          chalk.green(
            `The typo was saved at ${config.typoFolder}/${
              config.typoSettingsFilename
            }!`
          )
        );
      }
    );
  };

  const writeFonts = async project => {
    if (!config.fonts) {
      config.fonts = "./";
    }
    if (config.fonts.indexOf("/fonts") > -1) {
      let imageOutput = config.fonts.split("/");
      if (imageOutput[imageOutput.length - 1] === "fonts") {
        imageOutput.length -= 1;
      }
      config.fonts = imageOutput.join("/");
    }
    await checkOrCreateFolder(`${process.cwd()}/${config.fonts}/fonts/`);
    const writer = fs.createWriteStream(
      `${process.cwd()}/${config.fonts}/fonts/allFonts.zip`
    );
    console.log(`Making connection with api: ${host}/parlor-cli/fonts`);
    const spinner = new Spinner("processing.. %s");
    spinner.setSpinnerString("|/-\\");
    spinner.start();
    const response = await axios({
      method: "post",
      responseType: "stream",
      url: `${host}/parlor-cli/fonts`,
      data: {
        username: config.username,
        password: config.password,
        projectId: config.projectId
      }
    });
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    const zip = new AdmZip(
      `${process.cwd()}/${config.fonts}/fonts/allFonts.zip`
    );
    spinner.setSpinnerString("Unzipping files");
    zip.extractAllTo(`${process.cwd()}/${config.fonts}/fonts`, true);
    fs.unlinkSync(`${process.cwd()}/${config.fonts}/fonts/allFonts.zip`);
    spinner.stop(true);
    console.log(chalk.green(`Fonts have been saved to ${config.fonts}/fonts`));
  };

  const writeImages = async project => {
    if (!config.images) {
      config.images = "./";
    }
    if (config.images.indexOf("/images") > -1) {
      let imageOutput = config.images.split("/");
      if (imageOutput[imageOutput.length - 1] === "images") {
        imageOutput.length -= 1;
      }
      config.images = imageOutput.join("/");
    }
    await checkOrCreateFolder(`${process.cwd()}/${config.images}/images`);
    console.log(
      `Making connection with api: ${host}/project/${
        config.projectId
      }/images/download`
    );
    const spinner = new Spinner("processing.. %s");
    spinner.setSpinnerString("|/-\\");
    spinner.start();
    const writerImages = fs.createWriteStream(
      `${process.cwd()}/${config.images}/images/allImages.zip`
    );
    const responseImages = await axios({
      method: "post",
      responseType: "stream",
      url: `${host}/project/${config.projectId}/images/download`,
      data: {
        username: config.username,
        password: config.password,
        projectId: config.projectId
      }
    });
    responseImages.data.pipe(writerImages);
    await new Promise((resolve, reject) => {
      writerImages.on("finish", resolve);
      writerImages.on("error", reject);
    });

    const zip2 = new AdmZip(
      `${process.cwd()}/${config.images}/images/allImages.zip`
    );
    zip2.extractAllTo(config.images + "/images", true);
    fs.unlinkSync(`${process.cwd()}/${config.images}/images/allImages.zip`);
    spinner.stop(true);
    console.log(
      chalk.green(`Images have been saved to ${config.images}/images`)
    );
  };

  const checkOrCreateFolder = pathname => {
    return new Promise(resolve => {
      //create folders if there is one needed
      mkdirp(pathname, err => {
        if (!err) resolve();
      });
    });
  };

  if (!commands.includes(args[2])) {
    errorLog("invalid command passed");
    usageHelper();
  } else {
    //we have the args we want

    if (config.username && config.projectId && config.password) {
      try {
        const project = await axios({
          method: "post",
          url: `${host}/parlor-cli`,
          data: {
            username: config.username,
            password: config.password,
            projectId: config.projectId
          }
        });
        if (
          project.data.fontStatus &&
          project.data.typoStatus &&
          project.data.colorStatus &&
          project.data.gridStatus
        ) {
          if (args.includes("colors")) {
            writeColors(project);
          }
          if (args.includes("grid")) {
            writeGrid(project);
          }
          if (args.includes("fonts")) {
            writeFonts(project);
          }
          if (args.includes("typo")) {
            writeTypo(project);
          }
          if (args.includes("images")) {
            writeImages(project);
          }
        } else {
          errorLog(
            "The project you are looking for is not finished or does not exsist"
          );
        }
      } catch (e) {
        errorLog(e);
      }
    }
  }
})();
