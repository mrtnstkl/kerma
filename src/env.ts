const getEnvVariableWithDefault = (envVariableName: string, defaultValue: string) => {
  const envVariable = process.env[envVariableName];

  if (envVariable === undefined || envVariable === '') {
    return defaultValue;
  }

  return envVariable;
};

export const OBJECT_DATABASE_DIRECTORY = getEnvVariableWithDefault(
  'OBJECT_DATABASE_DIRECTORY',
  './db',
);
export const BIND_PORT = parseInt(getEnvVariableWithDefault('BIND_PORT', '18018'), 10);
export const PUBLIC_HOST_NAME = getEnvVariableWithDefault('PUBLIC_HOST_NAME', 'kerma.gnorts.xyz');

// Can provide a list of bootstrap peers separated by commas
export const BOOTSTRAP_PEERS = getEnvVariableWithDefault(
  'BOOTSTRAP_PEERS',
  '128.130.122.73:18018',
).split(',');

/* What the agent sends as its information */
export const AGENT_HOST_ADDRESS = getEnvVariableWithDefault(
  'AGENT_HOST_ADDRESS',
  'kerma.gnorts.xyz:18018',
);
export const AGENT_NAME = getEnvVariableWithDefault('AGENT_NAME', 'b0b3r');
export const AGENT_VERSION = getEnvVariableWithDefault('AGENT_VERSION', '0.10.0');
