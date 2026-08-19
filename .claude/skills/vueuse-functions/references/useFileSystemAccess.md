---
category: Browser
---

# useFileSystemAccess

Create and read and write local files with FileSystemAccessAPI

## Usage

```ts
import { useFileSystemAccess } from '@vueuse/core'

const {
  isSupported,
  data,
  file,
  fileName,
  fileMIME,
  fileSize,
  fileLastModified,
  create,
  open,
  save,
  saveAs,
  updateData
} = useFileSystemAccess()
```

## Type Declarations

```ts
/**
 * window.showOpenFilePicker parameters
 * @see vendored reference
 */
export interface FileSystemAccessShowOpenFileOptions {
  multiple?: boolean
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
  excludeAcceptAllOption?: boolean
}
/**
 * window.showSaveFilePicker parameters
 * @see vendored reference
 */
export interface FileSystemAccessShowSaveFileOptions {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
  excludeAcceptAllOption?: boolean
}
/**
 * FileHandle
 * @see vendored reference
 */
export interface FileSystemFileHandle {
  getFile: () => Promise<File>
  createWritable: () => FileSystemWritableFileStream
}
/**
 * @see vendored reference
 */
interface FileSystemWritableFileStream extends WritableStream {
  /**
   * @see vendored reference
   */
  write: FileSystemWritableFileStreamWrite
  /**
   * @see vendored reference
   */
  seek: (position: number) => Promise<void>
  /**
   * @see vendored reference
   */
  truncate: (size: number) => Promise<void>
}
/**
 * FileStream.write
 * @see vendored reference
 */
interface FileSystemWritableFileStreamWrite {
  (data: string | BufferSource | Blob): Promise<void>
  (options: {
    type: "write"
    position: number
    data: string | BufferSource | Blob
  }): Promise<void>
  (options: { type: "seek"; position: number }): Promise<void>
  (options: { type: "truncate"; size: number }): Promise<void>
}
/**
 * FileStream.write
 * @see vendored reference
 */
export type FileSystemAccessWindow = Window & {
  showSaveFilePicker: (
    options: FileSystemAccessShowSaveFileOptions,
  ) => Promise<FileSystemFileHandle>
  showOpenFilePicker: (
    options: FileSystemAccessShowOpenFileOptions,
  ) => Promise<FileSystemFileHandle[]>
}
export type UseFileSystemAccessCommonOptions = Pick<
  FileSystemAccessShowOpenFileOptions,
  "types" | "excludeAcceptAllOption"
>
export type UseFileSystemAccessShowSaveFileOptions = Pick<
  FileSystemAccessShowSaveFileOptions,
  "suggestedName"
>
export type UseFileSystemAccessOptions = ConfigurableWindow &
  UseFileSystemAccessCommonOptions & {
    /**
     * file data type
     */
    dataType?: MaybeRefOrGetter<"Text" | "ArrayBuffer" | "Blob">
  }
/**
 * Create and read and write local files.
 * @see vendored reference
 */
export declare function useFileSystemAccess(): UseFileSystemAccessReturn<
  string | ArrayBuffer | Blob
>
export declare function useFileSystemAccess(
  options: UseFileSystemAccessOptions & {
    dataType: "Text"
  },
): UseFileSystemAccessReturn<string>
export declare function useFileSystemAccess(
  options: UseFileSystemAccessOptions & {
    dataType: "ArrayBuffer"
  },
): UseFileSystemAccessReturn<ArrayBuffer>
export declare function useFileSystemAccess(
  options: UseFileSystemAccessOptions & {
    dataType: "Blob"
  },
): UseFileSystemAccessReturn<Blob>
export declare function useFileSystemAccess(
  options: UseFileSystemAccessOptions,
): UseFileSystemAccessReturn<string | ArrayBuffer | Blob>
export interface UseFileSystemAccessReturn<T = string> {
  isSupported: ComputedRef<boolean>
  data: ShallowRef<T | undefined>
  file: ShallowRef<File | undefined>
  fileName: ComputedRef<string>
  fileMIME: ComputedRef<string>
  fileSize: ComputedRef<number>
  fileLastModified: ComputedRef<number>
  open: (_options?: UseFileSystemAccessCommonOptions) => Awaitable<void>
  create: (_options?: UseFileSystemAccessShowSaveFileOptions) => Awaitable<void>
  save: (_options?: UseFileSystemAccessShowSaveFileOptions) => Awaitable<void>
  saveAs: (_options?: UseFileSystemAccessShowSaveFileOptions) => Awaitable<void>
  updateData: () => Awaitable<void>
}
```
