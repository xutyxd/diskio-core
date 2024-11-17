<p align="center">
  <a href="https://github.com/xutyxd/diskio">
    <picture>
      <source srcset="diskio-logo.png" width="150">
      <img alt="diskio logo" src="./diskio-logo.png" width="150">
    </picture>
  </a>
</p>

<h1 align="center">
  A disk I/O management utility to reserve, allocate, and optimize disk space usage, trying to ensure efficient file handling.
</h1>

<p align="left">
    <img src="https://img.shields.io/npm/dw/diskio-core"/>
    <img alt="NPM Unpacked Size" src="https://img.shields.io/npm/unpacked-size/diskio-core">
    <img alt="npm bundle size" src="https://img.shields.io/bundlephobia/min/diskio-core">
    <img alt="NPM Version" src="https://img.shields.io/npm/v/diskio-core">
</p>

## 📥 Installation

```bash
npm install diskio-core
```

## 📚 Use case

The `DiskIO` class is a utility that allows you to reserve, allocate, and optimize disk space usage, trying to ensure efficient file handling. It is designed to be used in a Node.js environment.

## 📋 Features

- Reserve disk space for a specific amount of bytes.
- Allocate disk space for a specific amount of bytes.
- Optimize disk space usage by allocating and freeing disk space as needed.
- Create, read, and delete files.
- Get information about the disk and DiskIO usage.

## 📖 Usage


### DiskIO

The `DiskIO` class is used to create an instance of the `DiskIO` class. It requires two parameters: the path to the directory where the DiskIO will be created and the amount of bytes to reserve for the DiskIO.

```typescript
import { DiskIO } from 'diskio-core';

const diskio = new DiskIO('./mocks/diskio-a', 10 * 1024 * 1024);
// Need to wait for the DiskIO to be ready
await diskio.ready;

```

### DiskIO.information

The `information` property is used to get information about the DiskIO and the DiskIO usage. It has two methods: `disk` and `diskio`.

#### DiskIO.information.disk

The `disk` method is used to get information about the disk usage. It returns an object with the following properties:

- `filesystem`: The filesystem type.
- `size`: The total size of the disk in bytes.
- `used`: The amount of used space in bytes.
- `available`: The amount of available space in bytes.
- `capacity`: The percentage of used space.
- `mount`: The mount point of the disk.

```typescript
const information = await diskio.information.disk();

console.log(information);
/*
{
    filesystem: 'ext4',
    size: 1073741824,
    used: 104857600,
    available: 996147200,
    capacity: '100%',
    mount: '/'
}
*/
```

#### DiskIO.information.diskio

The `diskio` method is used to get information about the DiskIO usage. It returns an object with the following properties:

- `size`: The size of the DiskIO in bytes.
- `used`: The amount of used space in bytes.
- `available`: The amount of available space in bytes.
- `capacity`: The percentage of used space.

```typescript
const information = await diskio.information.diskio();

console.log(information);
/*
{
    size: 104857600,
    used: 104857600,
    available: 0,
    capacity: '100%'
}
*/
```

### DiskIO.create

The `create` method is used to create a new file in the DiskIO. It requires one parameter: the name of the file to be created.

**NOTE**: It will use and UUID to create a folder system to improve performance. Save name to rerieve it later.

**NOTE**: It's have a sync version -> `createSync`.
```typescript
const file = await diskio.create('test.txt');

console.log(file.name); // 7cb79b23/b098/4c56/917c/005abaf72fd5/test.txt

await file.close();
```

### DiskIO.get

The `get` method is used to get a file from the DiskIO.

It requires one parameter: the name of the file to be retrieved.

Optionally, you can set the second parameter to `true` to check if the file exists. If file does not exist, it will throw an error.

**NOTE**: Is not required that the file exists in the DiskIO if you set the second parameter to `false`.

**NOTE**: It's have a sync version -> `getSync`.
```typescript
const file = await diskio.get('test.txt');

await file.close();
```

### DiskIO.read

The `read` method is used to read a file from the DiskIO. It requires three parameters: the file handle, the starting position, and the number of bytes to read.

**NOTE**: It's have a sync version -> `readSync`.
```typescript
const file = await diskio.get('test.txt');
// Using diskio
// const buffer = await diskio.read(file['fh'], 0, 1024);
// Using file, better way
const buffer = await file.read(0, 1024);

console.log(buffer.toString()); // Hello world!

await file.close();
```

### DiskIO.write

The `write` method is used to write a file to the DiskIO. It requires three parameters: the file handle, the data to be written, and the starting position.

**NOTE**: It's have a sync version -> `writeSync`.
```typescript
const file = await diskio.get('test.txt');

const buffer = Buffer.from('Hello world!');
// Using diskio
await diskio.write(file['fh'], buffer, 0);
// Using file, better way
await file.write(buffer, 0);

await file.close();
```

### DiskIO.delete

The `delete` method is used to delete a file from the DiskIO. It requires two parameters: the file handle and the name of the file to be deleted.

**NOTE**: It will delete all the folders and files in the path that are not empty.

```typescript
const file = await diskio.get('test.txt');
// Using diskio
await diskio.delete(file['fh'], file.name);
// Using file, better way
await file.delete();
```

## License

This project is licensed under this [GNU AFFERO GENERAL PUBLIC LICENSE](https://github.com/xutyxd/diskio/blob/main/LICENSE).