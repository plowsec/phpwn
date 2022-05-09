# phpwn
find interesting code paths in php codebases

```bash
➜  phpwn node phpwn.js 2>/dev/null | head -n 100                                                                                                                                                   23:33:34
Found class: [object Object]
Found class that inherits from AbstractBlock : Template
Found method with 0 arguments: _construct
Found method with 0 arguments: getTemplate
Found method with 0 arguments: getArea
Found method with 0 arguments: _toHtml
Found method with 0 arguments: getBaseUrl
Found method with 0 arguments: getCacheKeyInfo
Found method with 0 arguments: getRootDirectory
Found method with 0 arguments: getMediaDirectory
Method _construct
│   [174] calling $this->hasData
│   [175] calling $this->setTemplate
│   └── Method setTemplate
│   │   [198] reading $this
│   │   [197] writing to $this->_template from template
│   [175] calling $this->getData

Method getTemplate
│   [186] reading $_template

Method getArea

Method _toHtml
│   [293] calling $this->fetchView
│   └── Method fetchView
│   │   [280] reading $html
│   │   [260] calling $this->validator->isValid
│   │   [263] writing to $html from callexpr
│   │   [263] calling $templateEngine->render
│   │   [262] writing to $templateEngine from callexpr
│   │   [262] calling $this->templateEnginePool->get
│   │   [261] writing to $extension from callexpr
│   │   [254] writing to $relativeFilePath from callexpr
│   │   [254] calling $this->getRootDirectory->undefined->getRelativePath
│   │   └── Method getRootDirectory
│   │   │   [348] reading $directory
│   │   │   [345] writing to $this->directory from callexpr
│   │   │   [345] calling $this->_filesystem->getDirectoryRead
│   [293] calling $this->getTemplateFile
│   └── Method getTemplateFile
│   │   [214] calling $this->resolver->getTemplateFileName
│   │   [212] writing to $paramsundefined from area
│   │   [210] writing to $area from callexpr
│   │   [210] calling $this->getArea
│   │   └── Method getArea
│   │   [209] writing to $params from unknown (TODO)

Method getBaseUrl
│   [306] reading $_baseUrl
│   [304] writing to $this->_baseUrl from callexpr
│   [304] calling $this->_urlBuilder->getBaseUrl

Method getCacheKeyInfo

Method getRootDirectory
│   [348] reading $directory
│   [345] writing to $this->directory from callexpr
│   [345] calling $this->_filesystem->getDirectoryRead

Method getMediaDirectory
│   [361] reading $mediaDirectory
│   [359] writing to $this->mediaDirectory from callexpr
│   [359] calling $this->_filesystem->getDirectoryRead
```
