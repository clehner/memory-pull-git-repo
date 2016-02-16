var test = require('tape')
var tests = require('abstract-pull-git-repo/tests')
var Repo = require('.')

tests.repo(test, new Repo)
