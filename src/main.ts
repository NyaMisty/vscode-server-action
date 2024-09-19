import { resolve, dirname } from 'node:path'
import { platform } from 'node:os'
import { execa } from 'execa'

import { download, resolveCliPathFromVSCodeExecutablePath } from '@vscode/test-electron';
import { getInput } from '@actions/core'

const nodePath = resolve(process.argv[1])

export const run = async (): Promise<void> => {
  /**
   * name of the machine to access
   */
  const machineId = (
    getInput('machineName')
    || process.env.GITHUB_RUN_ID
    || `machine-${Date.now()}`
  ).slice(0, 20)

  /**
   * The time until the action continues the build of the machine
   * does not get authorised
   */
  const timeout = (
    parseInt(getInput('timeout'), 10)
    || 30 * 1000 // default 30s
  )

  /**
   * download latest VS Code
   */
  const vscodePath = await download({ version: 'stable' })
  const codePath = resolveCliPathFromVSCodeExecutablePath(vscodePath);

  // const codePath = platform() === 'darwin'
  //   ? resolve(electronPath, '..', '..', 'Resources', 'app', 'bin', 'code')
  //   : platform() === 'win32'
  //     ? resolve(dirname(electronPath), 'bin', 'code.cmd')
  //     : resolve(dirname(electronPath), 'bin', 'code')

  /**
   * name the machine as an individual command so that we don't
   * get prompt when launching the server
   */
  console.log('RUN', codePath, ['tunnel', '--accept-server-license-terms', 'rename', machineId].join(' '));
  await execa(codePath, ['--help'])
  const startServer = await Promise.race([
    new Promise((resolve) => setTimeout(() => resolve(false), timeout)),
    new Promise((resolve) => {
      let buf = '';
  
      // start the process first
      const proc = execa(
        codePath,
        ['tunnel', '--accept-server-license-terms', 'rename', machineId],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
  
      // handle stdout & stderr
      proc.stdout?.on('data', (chunk) => {
        buf += chunk.toString();
      });
  
      proc.stderr?.on('data', (chunk) => {
        buf += chunk.toString();
      });
  
      // re-output full log every 3 seconds
      const interval = setInterval(() => {
        console.log('--- Current Output ---');
        console.log(buf);
      }, 3000);
  
      proc.then(() => {
        clearInterval(interval);
        resolve(true);
      }).catch((error) => {
        clearInterval(interval);
        console.error('Command failed:', error);
        resolve(false);
      });
    })
  ])

  console.log(5)
  if (!startServer) {
    console.log('Timeout reached, continuing the build')
    return process.exit(0)
  }

  console.log(6)
  await execa(codePath, ['tunnel', '--accept-server-license-terms'], {
    stdio: [process.stdin, process.stdout, process.stderr]
  })
}

/**
 * only run action if module is called through Node
 */
if (nodePath.endsWith('index.js')) {
  await run()
}
