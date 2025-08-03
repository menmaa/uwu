# UwU File Packer (.uwu)

A simple typescript file packer. Formerly used by a game launcher for large game file patching.
Its main purpose was to pack thousands of files into a single one, split in 500 MiB parts.
Generates a JSON compressed file that can be used for unpacking in code.

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