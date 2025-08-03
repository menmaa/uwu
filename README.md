# UwU File Packer (.uwu)

A simple typescript file packer. Formerly used by a game launcher for large game file patching.

## Usage

Currently, only packing from code is available in this module.

```js
import { packDir } from 'uwu';

async function pack() {
    const sourceDirectory = "/home/user/myphotos";
    const destinationDirectory = "/home/user/packedphotos";
    const options = {
        maxPartSize: 500 * 1024 * 1024, // 500 MiB
        outputNameFormat: 'photos_%d.uwu',
        compressed: true
    };
    const result = await packDir(sourceDirectory, destinationDirectory, options);
    return result;
}
```