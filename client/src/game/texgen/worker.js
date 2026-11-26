import { paintTexture } from './paint'

/**
 * The texture painter's own thread: paints what it's asked for, one at a time, and hands
 * the pixels back (transferred, not copied). Nothing it does can stall a frame.
 */
self.onmessage = (event) => {
  const { id, kind, size } = event.data
  const { width, height, data } = paintTexture(kind, size)
  self.postMessage({ id, width, height, data }, [data.buffer])
}
