// Mock implementation of @actions/core
const info = jest.fn();
const debug = jest.fn();
const warning = jest.fn();
const error = jest.fn();
const setFailed = jest.fn();
const setOutput = jest.fn();
const getInput = jest.fn();
const getBooleanInput = jest.fn();
const setSecret = jest.fn();
const addPath = jest.fn();
const exportVariable = jest.fn();
const summary = {
  addRaw: jest.fn().mockReturnThis(),
  addEOL: jest.fn().mockReturnThis(),
  write: jest.fn().mockResolvedValue(undefined),
};
const notice = jest.fn();
const startGroup = jest.fn();
const endGroup = jest.fn();
const saveState = jest.fn();
const getState = jest.fn();
const group = jest.fn();
const isDebug = jest.fn().mockReturnValue(false);

export {
  info,
  debug,
  warning,
  error,
  setFailed,
  setOutput,
  getInput,
  getBooleanInput,
  setSecret,
  addPath,
  exportVariable,
  summary,
  notice,
  startGroup,
  endGroup,
  saveState,
  getState,
  group,
  isDebug,
};
