#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { buildCleanupArtifact, stableJson } from "./index";

interface Arguments {
  flights: string;
  airports: string;
  output: string;
}

const usage = "Usage: history-cleanup --flights <path> --airports <path> --output <path>";

export const parseArguments = (args: string[]): Arguments => {
  const values: Partial<Arguments> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || !["--flights", "--airports", "--output"].includes(flag)) throw new Error(usage);
    const name = flag.slice(2) as keyof Arguments;
    if (values[name]) throw new Error(`Duplicate ${flag} argument. ${usage}`);
    values[name] = value;
  }
  if (!values.flights || !values.airports || !values.output) throw new Error(usage);
  return values as Arguments;
};

export const run = async (args: string[]) => {
  const paths = parseArguments(args);
  const flightsPath = resolve(paths.flights);
  const airportsPath = resolve(paths.airports);
  const outputPath = resolve(paths.output);
  if (outputPath === flightsPath || outputPath === airportsPath) {
    throw new Error("Output path must not equal either input path.");
  }
  const [flightsContent, airportsContent] = await Promise.all([
    fs.readFile(flightsPath, "utf8"),
    fs.readFile(airportsPath, "utf8"),
  ]);
  const artifact = buildCleanupArtifact({
    flightsSource: { path: flightsPath, content: flightsContent },
    airportsSource: { path: airportsPath, content: airportsContent },
  });
  const temporaryPath = resolve(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.tmp`);
  try {
    await fs.writeFile(temporaryPath, stableJson(artifact), { encoding: "utf8", flag: "wx" });
    await fs.rename(temporaryPath, outputPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return artifact;
};

if (require.main === module) {
  run(process.argv.slice(2)).then((artifact) => {
    process.stdout.write(`${JSON.stringify(artifact.summary)}\n`);
  }).catch((error) => {
    process.stderr.write(`History cleanup preview failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
