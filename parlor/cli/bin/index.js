#! /usr/bin/env node

const chalk = require("chalk");

const args = process.argv;

const commands = ["build", "update"];
// usage represents the help guide
const usageHelper = () => {
  const usageText = `
  usage:
    parlor

    commands can be:

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
