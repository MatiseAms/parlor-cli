#! /usr/bin/env node
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ejs = require("ejs");
const AdmZip = require("adm-zip");
const mkdirp = require("mkdirp");

const imageOutput = {
  type: "text",
  name: "image",
  message: "Enter your image output"
};

const fontOutput = {
  type: "text",
  name: "fonts",
  message: "Enter your fonts output"
};

const typoOutput = {
  type: "text",
  name: "typo",
  message: "Enter your typo output"
};

const typoSetting = {
  type: "text",
  name: "typosetting",
  message: "Enter your typo usage output"
};

const gridOutput = {
  type: "text",
  name: "grid",
  message: "Enter your grid output"
};

const colorsOutput = {
  type: "text",
  name: "color",
  message: "Enter your colors output"
};

const args = process.argv;
let config = {};
(async () => {
  if (fs.existsSync("./parlor.config.js")) {
    config = require(`${process.cwd()}/parlor.config.js`);
  } else {
    const inquirer = require("inquirer");
    let questions = [];
    questions = questions.concat([
      {
        type: "number",
        name: "id",
        message: "Enter your project ID of Parlor"
      },
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
    if (args.includes("all")) {
      questions.push(
        fontOutput,
        typoOutput,
        typoSetting,
        colorsOutput,
        gridOutput,
        imageOutput
      );
    }
    if (args.includes("colors")) {
      questions.push(colorsOutput);
    }
    if (args.includes("grid")) {
      questions.push(gridOutput);
    }
    if (args.includes("typo")) {
      questions.push(typoOutput);
      questions.push(fontOutput);
      questions.push(typoSetting);
    }
    if (args.includes("images")) {
      questions.push(imageOutput);
    }

    await new Promise(resolve => {
      inquirer.prompt(questions).then(answers => {
        config.projectId = answers.id;
        config.username = answers.user;
        config.password = answers.password;
        config.colors = answers.color;
        config.typo = answers.typo;
        config.typoSettings = answers.typosetting;
        config.images = answers.image;
        config.grid = answers.grid;
        config.fonts = answers.fonts;
        resolve();
      });
    });
  }
  const host = config.host || "https://api.parlor.mati.se";
  const commands = ["all", "images", "typo", "colors"];
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
    const typos = typographies.map(typo => {
      typo.gridSize = `grid(${typo.baseSize}/80)`;
      typo.weight = typo.weight.map(weight => {
        return valueSwitch(weight);
      });
      return typo;
    });
    ejs.renderFile(
      `${__dirname}/ejs/typo-settings.ejs`,
      { fonts: typos },
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
    const paths = config.grid.split("/");
    paths.length -= 1;
    await checkOrCreateFolder(paths.join("/") + "/");
    const colorScss = createColorFile(project.data.colors);
    fs.writeFile(config.colors, colorScss, err => {
      if (err) {
        return console.log(err);
      }
      console.log(chalk.green(`The Colors are saved at ${config.colors}!`));
    });
  };

  const writeGrid = async project => {
    const paths = config.grid.split("/");
    paths.length -= 1;
    await checkOrCreateFolder(paths.join("/") + "/");
    const outputGrid = `$grid-columns: ${project.data.grids[0].value};`;
    fs.writeFile(config.grid, outputGrid, err => {
      if (err) {
        return console.log(chalk.red(err));
      }
      console.log(chalk.green(`The grid file was saved at ${config.grid}!`));
    });
  };

  const writeTypo = async project => {
    const paths = config.typo.split("/");
    paths.length -= 1;
    await checkOrCreateFolder(paths.join("/") + "/");
    const typoScss = createTypoFile(project.data.typographies);
    fs.writeFile(config.typo, typoScss, err => {
      if (err) {
        return console.log(err);
      }
      console.log(chalk.green(`The typo was saved at ${config.typo}!`));
    });
  };

  const writeTypoSettings = async project => {
    const typoSettings = createTypoFileSettings(project.data.typographies);
    fs.writeFile(config.typoSettings, typoSettings, err => {
      if (err) {
        return console.log(err);
      }
      console.log("The file was saved!");
    });

    mkdirp(config.fonts);

    const writer = fs.createWriteStream(`${config.fonts}allFonts.zip`);
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
    const zip = new AdmZip(`${config.fonts}allFonts.zip`);
    zip.extractAllTo(config.fonts, true);
    fs.unlinkSync(`${config.fonts}allFonts.zip`);
    console.log(chalk.green(`Fonts have been saved to ${config.fonts}`));
  };

  const writeImages = async project => {
    mkdirp(config.images);

    const writerImages = fs.createWriteStream(`${config.images}allImages.zip`);
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

    const zip2 = new AdmZip(`${config.images}allImages.zip`);
    zip2.extractAllTo(config.images, true);
    fs.unlinkSync(`${config.images}allImages.zip`);
    console.log(chalk.green(`Images have been saved to ${config.images}`));
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
          if (args.includes("colors") || args.includes("all")) {
            writeColors(project);
          }
          if (args.includes("grid") || args.includes("all")) {
            writeGrid(project);
          }
          if (args.includes("typo") || args.includes("all")) {
            writeTypoSettings(project);
            writeTypo(project);
          }
          if (args.includes("images") || args.includes("all")) {
            writeImages(project);
          }
        } else {
          errorLog("You did not finish the checklist yet, please update it!");
        }
      } catch (e) {
        errorLog(e);
      }
    }
  }
})();
