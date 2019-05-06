#! /usr/bin/env node
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ejs = require("ejs");
const AdmZip = require("adm-zip");
const mkdirp = require("mkdirp");

const args = process.argv;

const commands = ["build", "update"];
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

// we make sure the length of the arguments is exactly three
if (args.length > 3) {
  errorLog(`only one argument can be accepted`);
  usageHelper();
}

if (!commands.includes(args[2])) {
  errorLog("invalid command passed");
  usageHelper();
} else {
  //we have the args we want
}

(async () => {
  if (fs.existsSync("./parlor.config.js")) {
    try {
      const config = require(`${process.cwd()}/parlor.config.js`);
      const project = await axios({
        method: "post",
        url: "https://api.parlor.mati.se/parlor-cli",
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
        const colorScss = createColorFile(project.data.colors);
        fs.writeFile(config.colors, colorScss, err => {
          if (err) {
            return console.log(err);
          }

          console.log("The file was saved!");
        });
        const outputGrid = `$grid-columns: ${project.data.grids[0].value};`;
        fs.writeFile(config.grid, outputGrid, err => {
          if (err) {
            return console.log(err);
          }

          console.log("The file was saved!");
        });

        const typoScss = createTypoFile(project.data.typographies);
        fs.writeFile(config.typo, typoScss, err => {
          if (err) {
            return console.log(err);
          }

          console.log("The file was saved!");
        });

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
          url: "https://api.parlor.mati.se/parlor-cli/fonts",
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
      } else {
        errorLog("You did not finish the checklist yet, please update it!");
      }
    } catch (e) {
      errorLog(e);
    }
  }
})();

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
  ejs.renderFile(`${__dirname}/ejs/color.ejs`, { colors }, null, (err, str) => {
    text = str;
  });
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
