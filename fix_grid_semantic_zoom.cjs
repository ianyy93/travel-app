const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Remove TransformWrapper
content = content.replace(/import \{ TransformWrapper, TransformComponent \} from 'react-zoom-pan-pinch';\n/, '');

const targetStart = `<div ref={gridScrollContainerRef} className="flex-1 overflow-hidden bg-slate-50 relative pb-20 scrollbar-hide cursor-grab active:cursor-grabbing">
                        <TransformWrapper
                          initialScale={1}
                          minScale={0.2}
                          maxScale={3}
                          limitToBounds={false}
                          panning={{ velocityDisabled: false }}
                          pinch={{ step: 5 }}
                        >
                          <TransformComponent wrapperClass="!w-full !h-full" contentClass="min-w-max min-h-max">
                            <div className="flex min-w-max min-h-max relative">`;

const replaceStart = `<div ref={gridScrollContainerRef} className="flex-1 overflow-auto bg-slate-50 relative pb-20 scrollbar-hide touch-pan-x touch-pan-y">
                        <div className="flex min-w-max min-h-max relative">`;

content = content.replace(targetStart, replaceStart);

const targetEnd = `                          </div>
                        </div>
                          </TransformComponent>
                        </TransformWrapper>
                      </div>`;

const replaceEnd = `                          </div>
                        </div>
                      </div>`;

content = content.replace(targetEnd, replaceEnd);

fs.writeFileSync('src/App.tsx', content);
